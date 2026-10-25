"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import { EmptyState } from "@/components/empty-state"
import Stats01 from "@/components/stats-01"
import { RowActions } from "@/components/row-actions"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { DetailItem, DetailList } from "@/components/detail-list"
import { LiveBadge } from "@/components/live-badge"
import { momTrend } from "@/lib/stat-trend"
import { isSyncing, sameJson } from "@/lib/live"
import { useLiveReload } from "@/hooks/use-live-reload"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import {
  loadAnnouncements,
  saveAnnouncements,
  type StoredAnnouncement,
} from "@/lib/announcements-store"
import { sendWaMessage } from "@/lib/api"
import { fileToBase64 } from "@/lib/file-base64"
import { MegaphoneIcon, PaperclipIcon, PlusIcon, X } from "lucide-react"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const MAX_FILE_BYTES = 3 * 1024 * 1024 // 3 MB per file (base64 must fit the API body limit)

const initialForm = {
  title: "",
  message: "",
  studentIds: [] as string[],
}

function nextAnnouncementId(n: number) {
  return `ANN-${String(n).padStart(3, "0")}`
}

export default function AnnouncementsPage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [items, setItems] = useState<StoredAnnouncement[]>([])
  const [nextId, setNextId] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [sending, setSending] = useState(false)
  const [formError, setFormError] = useState("")
  const [availableStudents, setAvailableStudents] = useState<StoredStudent[]>(
    []
  )
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [viewItem, setViewItem] = useState<StoredAnnouncement | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function addFiles(selected: FileList | null) {
    if (!selected || selected.length === 0) return
    const incoming = Array.from(selected)
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES)
    setFormError("")
    setFiles((prev) => [
      ...prev,
      ...incoming
        .filter((f) => f.size <= MAX_FILE_BYTES)
        .filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size)),
    ])
    if (tooBig.length > 0) {
      setFormError(
        `Attachment skipped (over 3 MB): ${tooBig.map((f) => f.name).join(", ")}`
      )
    }
  }

  function clearFiles() {
    setFiles([])
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  const reloadAnnouncements = useCallback(() => {
    if (isSyncing()) return
    loadAnnouncements().then((stored) => {
      if (isSyncing()) return
      setItems((prev) => (sameJson(prev, stored) ? prev : stored))
      if (stored.length > 0) {
        const max = stored.reduce((m, a) => {
          const n = parseInt(a.announcementId.replace(/\D/g, ""), 10)
          return Number.isNaN(n) ? m : Math.max(m, n)
        }, 0)
        setNextId((n) => Math.max(n, max + 1))
      }
      setHydrated(true)
    }).catch((error) => {
      console.error("Failed to load announcements", error)
    })
  }, [])

  useEffect(() => {
    reloadAnnouncements()
  }, [reloadAnnouncements])

  useLiveReload(reloadAnnouncements)

  useEffect(() => {
    if (hydrated) void saveAnnouncements(items)
  }, [items, hydrated])

  const reloadDependencies = useCallback(() => {
    loadStudents()
      .then(setAvailableStudents)
      .catch((error) => console.error("Failed to load students", error))
    loadGroups()
      .then(setGroups)
      .catch((error) => console.error("Failed to load student groups", error))
  }, [])

  useEffect(() => {
    reloadDependencies()
  }, [reloadDependencies])

  useEffect(() => {
    if (open) {
      reloadDependencies()
    }
  }, [open, reloadDependencies])

  function toggleStudent(id: string) {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id)
        ? f.studentIds.filter((s) => s !== id)
        : [...f.studentIds, id],
    }))
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.studentIds.length === 0) {
      setFormError("Select at least one student.")
      return
    }
    if (!form.message.trim() && files.length === 0) {
      setFormError("Write a message or attach a file.")
      return
    }
    setFormError("")

    // Editing updates the saved record without re-sending on WhatsApp.
    if (editingIndex !== null) {
      const prev = items[editingIndex]
      const names = form.studentIds.map((id) => {
        const s = availableStudents.find((st) => st.studentId === id)
        if (s) return `${s.studentName} (${s.studentId})`
        const idx = prev?.recipientIds.indexOf(id) ?? -1
        return idx >= 0 ? (prev?.recipientNames[idx] ?? id) : id
      })
      setItems((list) =>
        list.map((a, i) =>
          i === editingIndex
            ? {
                ...a,
                title: form.title,
                message: form.message,
                recipientIds: [...form.studentIds],
                recipientNames: names,
              }
            : a
        )
      )
      setEditingIndex(null)
      setForm(initialForm)
      clearFiles()
      setOpen(false)
      return
    }

    setSending(true)

    // turn every selected file into its base64 payload once, then reuse for
    // every recipient
    const base64Sizes: { name: string; mime: string; size: number }[] = []
    const attachmentsForSend = [] as { name: string; mime: string; data: string }[]
    for (const file of files) {
      try {
        const data = await fileToBase64(file)
        attachmentsForSend.push({ name: file.name, mime: file.type || "application/octet-stream", data })
        base64Sizes.push({ name: file.name, mime: file.type ?? "", size: file.size })
      } catch {
        // unreadable file — skip
      }
    }

    // Send orderly: one recipient at a time, in list order. Text goes first;
    // every attachment follows as its own message.
    let sent = 0
    let failed = 0
    const names: string[] = []
    for (const id of form.studentIds) {
      const s = availableStudents.find((st) => st.studentId === id)
      names.push(s ? `${s.studentName} (${s.studentId})` : id)
      try {
        if (form.message.trim()) {
          await sendWaMessage({ to: s?.phone ?? id, message: `*${form.title}*\n${form.message}` })
        }
        for (const att of attachmentsForSend) {
          await sendWaMessage({ to: s?.phone ?? id, message: att === attachmentsForSend[0] && !form.message.trim() ? form.title : "", attachment: att })
        }
        if (form.message.trim() || attachmentsForSend.length > 0) {
          sent += 1
        }
      } catch {
        failed += 1
      }
    }

    const record: StoredAnnouncement = {
      announcementId: nextAnnouncementId(nextId),
      title: form.title,
      message: form.message,
      recipientIds: [...form.studentIds],
      recipientNames: names,
      attachments: base64Sizes.map((f) => ({ name: f.name, mime: f.mime })),
      sentCount: sent,
      failedCount: failed,
      status: failed === 0 ? "Sent" : sent === 0 ? "Failed" : "Partial",
      createdAt: new Date().toISOString(),
    }
    setItems((prev) => [...prev, record])
    setNextId((n) => n + 1)
    setForm(initialForm)
    clearFiles()
    setSending(false)
    setOpen(false)
  }

  function openEdit(index: number) {
    const a = items[index]
    if (!a) return
    setForm({
      title: a.title,
      message: a.message,
      studentIds: [...a.recipientIds],
    })
    clearFiles()
    setFormError("")
    setEditingIndex(index)
    setOpen(true)
  }

  function onDelete(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setFormError("")
    setEditingIndex(null)
    clearFiles()
    setOpen(false)
  }

  const delivered = items.reduce((sum, a) => sum + a.sentCount, 0)
  const failed = items.reduce((sum, a) => sum + a.failedCount, 0)
  const recipients = items.reduce((sum, a) => sum + a.recipientIds.length, 0)
  const deliveryRate = delivered + failed === 0 ? 0 : (delivered / (delivered + failed)) * 100
  const stats = [
    {
      name: "Announcements",
      value: String(items.length),
      ...momTrend(items.map((a) => ({ date: a.createdAt }))),
    },
    {
      name: "Messages delivered",
      value: String(delivered),
      ...momTrend(items.map((a) => ({ date: a.createdAt, amount: a.sentCount }))),
    },
    {
      name: "Delivery rate",
      value: `${deliveryRate.toFixed(1)}%`,
      change: `${recipients} recipients`,
      changeType: "neutral" as const,
    },
    {
      name: "Failed",
      value: String(failed),
      ...momTrend(items.map((a) => ({ date: a.createdAt, amount: a.failedCount })), { invert: true }),
    },
  ]

  return (
    <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Announcements" }]}>
      <PageHeader
        title="Announcements"
        description="Compose once — delivered to each student on WhatsApp, one by one. Connect WhatsApp in Settings first."
        liveSlot={<LiveBadge />}
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {items.length} total
            </span>
          </span>
        }
        actions={
          <>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              if (!v) {
                setForm(initialForm)
                setFormError("")
                setEditingIndex(null)
                clearFiles()
              }
              setOpen(v)
            }}
          >
                <DialogTrigger render={<Button />}>
              <PlusIcon />
              New Announcement
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {editingIndex !== null ? "Edit Announcement" : "New Announcement"}
                </DialogTitle>
                <DialogDescription>
                  {editingIndex !== null
                    ? "Update the saved record. Editing does not re-send on WhatsApp."
                    : "Written once, delivered to every selected student in order via WhatsApp."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col">
                <div className="grid gap-4 px-6 py-5">
                  <Field>
                    <FieldLabel htmlFor="title">Title</FieldLabel>
                    <Input
                      id="title"
                      placeholder="e.g. Fee due reminder"
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="message">Message</FieldLabel>
                    <textarea
                      id="message"
                      className={textareaClassName}
                      placeholder="Type the announcement sent to WhatsApp"
                      value={form.message}
                      onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                      rows={4}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>
                      Attachments (optional) — delivered right after the message
                    </FieldLabel>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="sr-only"
                      id="announcement-files"
                      onChange={(e) => {
                        addFiles(e.target.files)
                        // allow re-selecting the same file(s) later
                        e.target.value = ""
                      }}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                        <PaperclipIcon />
                        Choose files
                      </Button>
                      {(files.length > 0 || formError.startsWith("Attachment skipped")) && (
                        <Button type="button" variant="ghost" size="sm" onClick={clearFiles}>
                          <X />
                          Clear all
                        </Button>
                      )}
                    </div>
                    {files.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {files.map((f, i) => (
                          <span
                            key={`${f.name}-${f.size}-${i}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs text-muted-foreground"
                          >
                            <span className="max-w-56 truncate font-medium text-foreground" title={f.name}>
                              {f.name}
                            </span>
                            <span className="shrink-0">
                              {(f.size / 1024).toFixed(0)} KB
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded-full p-0.5 hover:bg-muted"
                              onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                              aria-label={`Remove ${f.name}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Images, PDFs, docs — up to 3 MB per file.
                    </p>
                  </Field>
                  <Field>
                    <FieldLabel>Students ({form.studentIds.length} of {availableStudents.length} selected)</FieldLabel>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            studentIds: availableStudents.map((s) => s.studentId),
                          }))
                        }
                      >
                        Select all ({availableStudents.length})
                      </Button>
                      {groups.length > 0 && (
                        <select
                          className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs shadow-xs outline-none focus-visible:border-ring"
                          defaultValue=""
                          onChange={(e) => {
                            const val = e.target.value
                            if (!val) return
                            const matched = groups.find((g) => g.groupName === val || g.groupId === val)
                            if (matched) {
                              // Select students enrolled in this group or matching group name
                              const targetIds = availableStudents
                                .filter((s) => matched.studentIds.includes(s.studentId) || s.group === matched.groupName)
                                .map((s) => s.studentId)
                              setForm((f) => ({
                                ...f,
                                studentIds: Array.from(new Set([...f.studentIds, ...targetIds])),
                              }))
                            }
                            e.target.value = ""
                          }}
                        >
                          <option value="" disabled>
                            + Select by Student Group
                          </option>
                          {groups.map((g) => (
                            <option key={g.groupId} value={g.groupName}>
                              {g.groupName} ({g.studentIds.length} students)
                            </option>
                          ))}
                        </select>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, studentIds: [] }))}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-[10px] border border-input bg-card p-1.5 custom-scroll">
                      {availableStudents.length === 0 ? (
                        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No students found. Add students first on the Students page.
                        </p>
                      ) : (
                        availableStudents.map((s) => (
                          <label
                            key={s.studentId}
                            className="app-transition flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={form.studentIds.includes(s.studentId)}
                                onChange={() => toggleStudent(s.studentId)}
                              />
                              <span className="font-medium text-foreground">{s.studentName}</span>
                              <span className="font-mono text-xs text-muted-foreground">{s.studentId}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                              {s.course && <span>{s.course}</span>}
                              {s.group ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                  {s.group}
                                </span>
                              ) : null}
                            </div>
                          </label>
                        ))
                      )}
                    </div>
                  </Field>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onCancel} disabled={sending}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={sending}>
                    {sending ? "Sending…" : editingIndex !== null ? "Save Changes" : "Send Announcement"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={viewItem !== null}
            onOpenChange={(v) => {
              if (!v) setViewItem(null)
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Announcement details
                </DialogTitle>
                <DialogDescription>
                  {viewItem?.title} · {viewItem?.announcementId}
                </DialogDescription>
              </DialogHeader>
              {viewItem && (
                <div className="px-6 py-5">
                  <DetailList>
                    <DetailItem label="Title">{viewItem.title}</DetailItem>
                    <DetailItem label="Announcement ID">{viewItem.announcementId}</DetailItem>
                    <DetailItem label="Message">{viewItem.message || "—"}</DetailItem>
                    <DetailItem label="Attachments">
                      {!viewItem.attachments || viewItem.attachments.length === 0
                        ? "—"
                        : viewItem.attachments
                            .map((a) => `${a.name} (${a.mime.split("/")[0] || "file"})`)
                            .join(", ")}
                    </DetailItem>
                    <DetailItem label="Recipients">
                      {viewItem.recipientNames.length === 0
                        ? "—"
                        : viewItem.recipientNames.join(", ")}
                    </DetailItem>
                    <DetailItem label="Delivered">
                      {viewItem.sentCount}/{viewItem.recipientIds.length}
                    </DetailItem>
                    <DetailItem label="Failed">{viewItem.failedCount}</DetailItem>
                    <DetailItem label="Status">
                      <StatusBadge value={viewItem.status} />
                    </DetailItem>
                    <DetailItem label="Date">
                      {new Date(viewItem.createdAt).toLocaleString()}
                    </DetailItem>
                  </DetailList>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <DeleteConfirmDialog
            open={deleteIndex !== null}
            onOpenChange={(v) => {
              if (!v) setDeleteIndex(null)
            }}
            title="Delete announcement?"
            description={`"${items[deleteIndex ?? -1]?.title ?? "This announcement"}" (${items[deleteIndex ?? -1]?.announcementId ?? ""}) will be permanently removed from the database. This action cannot be undone.`}
            onConfirm={() => {
              if (deleteIndex !== null) onDelete(deleteIndex)
              setDeleteIndex(null)
            }}
          />
          </>
        }
      />

      <Stats01 stats={stats} />

      <div className="data-table-surface">
        <div className="data-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Delivered</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={MegaphoneIcon}
                      title="No announcements yet"
                      hint="Click New Announcement above to message students on WhatsApp."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                items.map((a, i) => (
                  <TableRow key={`${a.announcementId}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{a.announcementId}</TableCell>
                    <TableCell className="font-medium text-foreground">{a.title}</TableCell>
                    <TableCell className="max-w-56 truncate text-muted-foreground" title={a.message}>
                      {a.message}
                      {a.attachments && a.attachments.length > 0 && (
                        <span
                          title={a.attachments.map((f) => f.name).join("\n")}
                          className="mt-0.5 flex max-w-56 items-center gap-1 text-[11px] text-muted-foreground/80"
                        >
                          <PaperclipIcon className="size-3 shrink-0" />
                          <span className="truncate">{a.attachments.length} attachment{a.attachments.length === 1 ? "" : "s"}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell title={a.recipientNames.join("\n")}>
                      {a.recipientIds.length} selected
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {a.sentCount}/{a.recipientIds.length}
                    </TableCell>
                    <TableCell>
                      <StatusBadge value={a.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">{new Date(a.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewItem(a)}
                        onEdit={() => openEdit(i)}
                        onDelete={() => setDeleteIndex(i)}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {items.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{items.length} announcement{items.length === 1 ? "" : "s"}</span>
            <span className="hidden sm:block">Sent one-by-one in list order</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
