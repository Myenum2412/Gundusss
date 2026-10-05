"use client"

import { useEffect, useState } from "react"
import { MegaphoneIcon, PlusIcon, Trash2Icon } from "lucide-react"
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
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DashboardShell } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import { EmptyState, TableCard } from "@/components/empty-state"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import {
  loadAnnouncements,
  saveAnnouncements,
  type StoredAnnouncement,
} from "@/lib/announcements-store"
import { sendWaMessage } from "@/lib/api"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-xs transition-all duration-200 outline-none placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

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

  useEffect(() => {
    const stored = loadAnnouncements()
    if (stored.length > 0) {
      setItems(stored)
      const max = stored.reduce((m, a) => {
        const n = parseInt(a.announcementId.replace(/\D/g, ""), 10)
        return Number.isNaN(n) ? m : Math.max(m, n)
      }, 0)
      setNextId(max + 1)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveAnnouncements(items)
  }, [items, hydrated])

  useEffect(() => {
    if (open) setAvailableStudents(loadStudents())
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

  function onDelete(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setFormError("")
    setOpen(false)
  }

  return (
    <DashboardShell
      crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Announcement" }]}
      title="Announcements"
      description="Compose once — delivered to each student on WhatsApp, one by one. Connect WhatsApp in Settings first."
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" /> New Announcement
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Announcement</DialogTitle>
              <DialogDescription>
                Written once, delivered to every selected student in
                order via WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="flex flex-col gap-6">
              <div className="grid gap-4">
                <Field>
                  <FieldLabel htmlFor="title">Title</FieldLabel>
                  <Input
                    id="title"
                    placeholder="e.g. Fee due reminder"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
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
                    onChange={(e) =>
                      setForm((f) => ({ ...f, message: e.target.value }))
                    }
                    rows={4}
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel>
                    Students ({form.studentIds.length} selected)
                  </FieldLabel>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          studentIds: availableStudents.map(
                            (s) => s.studentId
                          ),
                        }))
                      }
                    >
                      Select all
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setForm((f) => ({ ...f, studentIds: [] }))
                      }
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="max-h-44 overflow-y-auto rounded-xl border border-input bg-card p-2 shadow-xs">
                    {availableStudents.length === 0 ? (
                      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No students found. Add students first on the
                        Students page.
                      </p>
                    ) : (
                      availableStudents.map((s) => (
                        <label
                          key={s.studentId}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 hover:bg-muted"
                        >
                          <input
                            type="checkbox"
                            className="size-4 rounded accent-primary"
                            checked={form.studentIds.includes(s.studentId)}
                            onChange={() => toggleStudent(s.studentId)}
                          />
                          <span className="font-medium">
                            {s.studentName}
                          </span>
                          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                            {s.studentId}
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </Field>
              </div>

              {formError && (
                <p className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-sm text-destructive">{formError}</p>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                  disabled={sending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={sending}>
                  {sending ? "Sending…" : "Send Announcement"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-12">Sno</TableHead>
              <TableHead>Announcement ID</TableHead>
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
                    icon={<MegaphoneIcon />}
                    title="No announcements yet"
                    description="Broadcast fee reminders and updates to selected students over WhatsApp."
                    action={
                      <Button size="sm" onClick={() => setOpen(true)}>
                        <PlusIcon data-icon="inline-start" /> New Announcement
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              items.map((a, i) => (
                <TableRow key={`${a.announcementId}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{a.announcementId}</span>
                  </TableCell>
                  <TableCell className="font-medium">{a.title}</TableCell>
                  <TableCell
                    className="max-w-56 truncate text-muted-foreground"
                    title={a.message}
                  >
                    {a.message}
                  </TableCell>
                  <TableCell title={a.recipientNames.join("\n")}>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {a.recipientIds.length} selected
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.sentCount}/{a.recipientIds.length}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={a.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {new Date(a.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(i)}
                    >
                      <Trash2Icon data-icon="inline-start" /> Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableCard>
    </DashboardShell>
  )
}
