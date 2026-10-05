"use client"

import { useCallback, useEffect, useState } from "react"
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
import {
  loadAnnouncements,
  saveAnnouncements,
  type StoredAnnouncement,
} from "@/lib/announcements-store"
import { sendWaMessage } from "@/lib/api"
import { MegaphoneIcon, PlusIcon } from "lucide-react"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

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
  const [viewItem, setViewItem] = useState<StoredAnnouncement | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

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
    })
  }, [])

  useEffect(() => {
    reloadAnnouncements()
  }, [reloadAnnouncements])

  useLiveReload(reloadAnnouncements)

  useEffect(() => {
    if (hydrated) void saveAnnouncements(items)
  }, [items, hydrated])

  useEffect(() => {
    if (open) loadStudents().then(setAvailableStudents)
  }, [open])

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
      setOpen(false)
      return
    }

    setSending(true)

    // Send orderly: one recipient at a time, in list order.
    let sent = 0
    let failed = 0
    const names: string[] = []
    for (const id of form.studentIds) {
      const s = availableStudents.find((st) => st.studentId === id)
      names.push(s ? `${s.studentName} (${s.studentId})` : id)
      try {
        await sendWaMessage({
          to: s?.phone ?? id,
          message: `*${form.title}*\n${form.message}`,
        })
        sent += 1
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
      sentCount: sent,
      failedCount: failed,
      status: failed === 0 ? "Sent" : sent === 0 ? "Failed" : "Partial",
      createdAt: new Date().toISOString(),
    }
    setItems((prev) => [...prev, record])
    setNextId((n) => n + 1)
    setForm(initialForm)
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
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {items.length} total
            </span>
            <LiveBadge />
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
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel>Students ({form.studentIds.length} selected)</FieldLabel>
                    <div className="flex gap-2">
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
                        Select all
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, studentIds: [] }))}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="max-h-44 overflow-y-auto rounded-[10px] border border-input bg-card p-1.5">
                      {availableStudents.length === 0 ? (
                        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No students found. Add students first on the Students page.
                        </p>
                      ) : (
                        availableStudents.map((s) => (
                          <label
                            key={s.studentId}
                            className="app-transition flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={form.studentIds.includes(s.studentId)}
                              onChange={() => toggleStudent(s.studentId)}
                            />
                            <span className="font-medium">{s.studentName}</span>
                            <span className="font-mono text-xs text-muted-foreground">{s.studentId}</span>
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
