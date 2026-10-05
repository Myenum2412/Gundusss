"use client"

import { useEffect, useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import {
  loadAnnouncements,
  saveAnnouncements,
  type StoredAnnouncement,
} from "@/lib/announcements-store"
import { sendWaMessage } from "@/lib/api"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Announcement</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Announcement</h1>
              <p className="text-sm text-muted-foreground">
                Compose once — it is sent to each student on WhatsApp, one by
                one. Connect WhatsApp on the Settings page first.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>
                New Announcement
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
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-input p-2">
                        {availableStudents.length === 0 ? (
                          <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                            No students found. Add students first on the
                            Students page.
                          </p>
                        ) : (
                          availableStudents.map((s) => (
                            <label
                              key={s.studentId}
                              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                            >
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={form.studentIds.includes(s.studentId)}
                                onChange={() => toggleStudent(s.studentId)}
                              />
                              <span className="font-medium">
                                {s.studentName}
                              </span>
                              <span className="text-muted-foreground">
                                {s.studentId}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </Field>
                  </div>

                  {formError && (
                    <p className="text-sm text-destructive">{formError}</p>
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
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card text-card-foreground">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sno</TableHead>
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
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No announcements yet — click New Announcement.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((a, i) => (
                    <TableRow key={`${a.announcementId}-${i}`}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{a.announcementId}</TableCell>
                      <TableCell className="font-medium">{a.title}</TableCell>
                      <TableCell
                        className="max-w-56 truncate"
                        title={a.message}
                      >
                        {a.message}
                      </TableCell>
                      <TableCell title={a.recipientNames.join("\n")}>
                        {a.recipientIds.length} selected
                      </TableCell>
                      <TableCell>
                        {a.sentCount}/{a.recipientIds.length}
                      </TableCell>
                      <TableCell>{a.status}</TableCell>
                      <TableCell>
                        {new Date(a.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onDelete(i)}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
