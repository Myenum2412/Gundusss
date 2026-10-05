"use client"

import { useCallback, useEffect, useState } from "react"
import { loadStudents, saveStudents } from "@/lib/students-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
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
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { PlusIcon, UsersIcon } from "lucide-react"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const initialForm = {
  studentName: "",
  dob: "",
  gender: "",
  guardian: "",
  phone: "",
  email: "",
  address: "",
  group: "",
  course: "",
  joiningDate: "",
  status: "Active",
}

type Student = typeof initialForm & { studentId: string }

function nextStudentId(n: number) {
  return `STU-${String(n).padStart(3, "0")}`
}

export default function StudentsPage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [students, setStudents] = useState<Student[]>([])
  const [nextId, setNextId] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [viewStudent, setViewStudent] = useState<Student | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) loadDropdowns().then(setDropdowns)
  }, [open])

  const reloadStudents = useCallback(() => {
    if (isSyncing()) return
    loadStudents().then((stored) => {
      if (isSyncing()) return
      setStudents((prev) =>
        sameJson(prev, stored) ? prev : (stored as Student[])
      )
      if (stored.length > 0) {
        const max = stored.reduce((m, s) => {
          const n = parseInt(s.studentId.replace(/\D/g, ""), 10)
          return Number.isNaN(n) ? m : Math.max(m, n)
        }, 0)
        setNextId((n) => Math.max(n, max + 1))
      }
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    reloadStudents()
  }, [reloadStudents])

  useLiveReload(reloadStudents)

  useEffect(() => {
    if (hydrated) void saveStudents(students)
  }, [students, hydrated])

  function set(key: keyof typeof initialForm) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Persisted to Postgres via the save effect.
    // Student ID is auto-generated (STU-001, STU-002, ...).
    if (editingIndex !== null) {
      const id = students[editingIndex]?.studentId ?? nextStudentId(nextId)
      const updated: Student = { ...form, studentId: id }
      setStudents((prev) => prev.map((s, i) => (i === editingIndex ? updated : s)))
      setEditingIndex(null)
    } else {
      const student: Student = { ...form, studentId: nextStudentId(nextId) }
      setStudents((s) => [...s, student])
      setNextId((n) => n + 1)
    }
    setForm(initialForm)
    setOpen(false)
  }

  function openEdit(index: number) {
    const s = students[index]
    if (!s) return
    const { studentId, ...rest } = s
    void studentId
    setForm(rest)
    setEditingIndex(index)
    setOpen(true)
  }

  function onDelete(index: number) {
    setStudents((s) => s.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const active = students.filter((s) => s.status === "Active")
  const inactive = students.filter((s) => s.status !== "Active")
  const newThisMonth = students.filter((s) => (s.joiningDate ?? "").slice(0, 7) === nowKey).length
  const stats = [
    {
      name: "Total students",
      value: String(students.length),
      ...momTrend(students.map((s) => ({ date: s.joiningDate }))),
    },
    {
      name: "Active students",
      value: String(active.length),
      ...momTrend(active.map((s) => ({ date: s.joiningDate }))),
    },
    {
      name: "Joined this month",
      value: String(newThisMonth),
      ...momTrend(students.map((s) => ({ date: s.joiningDate }))),
    },
    {
      name: "Inactive students",
      value: String(inactive.length),
      ...momTrend(inactive.map((s) => ({ date: s.joiningDate })), { invert: true }),
    },
  ]

  return (
    <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}>
      <PageHeader
        title="Students"
        description="Every enrolment in one place. Add a student to issue receipts and send announcements."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {students.length} total
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
                setEditingIndex(null)
              }
              setOpen(v)
            }}
          >
            <DialogTrigger render={<Button />}>
              <PlusIcon />
              Add Student
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {editingIndex !== null ? "Edit Student" : "Add Student"}
                </DialogTitle>
                <DialogDescription>
                  {editingIndex !== null
                    ? "Update the student details below."
                    : "Student, contact, and academic details including joining date. ID is auto-generated."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col">
                <div className="flex flex-col gap-6 px-6 py-5">
                  {/* Student Information */}
                  <div>
                    <h2 className="text-[13px] font-semibold tracking-tight">Student information</h2>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="studentName">Student Name</FieldLabel>
                        <Input
                          id="studentName"
                          placeholder="Enter full name"
                          value={form.studentName}
                          onChange={set("studentName")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="dob">Date of Birth</FieldLabel>
                        <Input
                          id="dob"
                          type="date"
                          value={form.dob}
                          onChange={set("dob")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="gender">Gender</FieldLabel>
                        <select
                          id="gender"
                          className={selectClassName}
                          value={form.gender}
                          onChange={set("gender")}
                          required
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          {(dropdowns?.gender ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact Information */}
                  <div>
                    <h2 className="text-[13px] font-semibold tracking-tight">Contact information</h2>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="guardian">Parent / Guardian</FieldLabel>
                        <Input
                          id="guardian"
                          placeholder="Enter guardian name"
                          value={form.guardian}
                          onChange={set("guardian")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="phone">Phone Number</FieldLabel>
                        <Input
                          id="phone"
                          type="tel"
                          placeholder="Enter phone number"
                          value={form.phone}
                          onChange={set("phone")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="email">Email</FieldLabel>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter email address"
                          value={form.email}
                          onChange={set("email")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="address">Address</FieldLabel>
                        <Input
                          id="address"
                          placeholder="Enter address"
                          value={form.address}
                          onChange={set("address")}
                          required
                        />
                      </Field>
                    </div>
                  </div>

                  <Separator />

                  {/* Academic Information */}
                  <div>
                    <h2 className="text-[13px] font-semibold tracking-tight">Academic information</h2>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="group">Group / Class</FieldLabel>
                        <select
                          id="group"
                          className={selectClassName}
                          value={form.group}
                          onChange={set("group")}
                          required
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          {(dropdowns?.classGroup ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="course">Course</FieldLabel>
                        <select
                          id="course"
                          className={selectClassName}
                          value={form.course}
                          onChange={set("course")}
                          required
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          {(dropdowns?.course ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="joiningDate">Joining Date</FieldLabel>
                        <Input
                          id="joiningDate"
                          type="date"
                          value={form.joiningDate}
                          onChange={set("joiningDate")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="status">Student Status</FieldLabel>
                        <select
                          id="status"
                          className={selectClassName}
                          value={form.status}
                          onChange={set("status")}
                          required
                        >
                          {(dropdowns?.studentStatus ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingIndex !== null ? "Save Changes" : "Save Student"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={viewStudent !== null}
            onOpenChange={(v) => {
              if (!v) setViewStudent(null)
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Student details
                </DialogTitle>
                <DialogDescription>
                  {viewStudent?.studentName} · {viewStudent?.studentId}
                </DialogDescription>
              </DialogHeader>
              {viewStudent && (
                <div className="px-6 py-5">
                  <DetailList>
                    <DetailItem label="Student Name">{viewStudent.studentName}</DetailItem>
                    <DetailItem label="Student ID">{viewStudent.studentId}</DetailItem>
                    <DetailItem label="Date of Birth">{viewStudent.dob || "—"}</DetailItem>
                    <DetailItem label="Gender">{viewStudent.gender || "—"}</DetailItem>
                    <DetailItem label="Parent / Guardian">{viewStudent.guardian || "—"}</DetailItem>
                    <DetailItem label="Phone">{viewStudent.phone || "—"}</DetailItem>
                    <DetailItem label="Email">{viewStudent.email || "—"}</DetailItem>
                    <DetailItem label="Address">{viewStudent.address || "—"}</DetailItem>
                    <DetailItem label="Group / Class">{viewStudent.group || "—"}</DetailItem>
                    <DetailItem label="Course">{viewStudent.course || "—"}</DetailItem>
                    <DetailItem label="Joining Date">{viewStudent.joiningDate || "—"}</DetailItem>
                    <DetailItem label="Status">
                      <StatusBadge value={viewStudent.status} />
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
            title="Delete student?"
            description={`${students[deleteIndex ?? -1]?.studentName ?? "This student"} (${students[deleteIndex ?? -1]?.studentId ?? ""}) will be permanently removed from the database. This action cannot be undone.`}
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
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Group / Class</TableHead>
                <TableHead>Course</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Joining Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={9} className="p-0">
                    <EmptyState
                      icon={UsersIcon}
                      title="No students yet"
                      hint="Click Add Student above to enrol your first student. They will appear here across the full width of this table."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                students.map((s, i) => (
                  <TableRow key={`${s.studentId}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{s.studentName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.studentId}</TableCell>
                    <TableCell>{s.group}</TableCell>
                    <TableCell>{s.course}</TableCell>
                    <TableCell className="tabular-nums">{s.phone}</TableCell>
                    <TableCell className="tabular-nums">{s.joiningDate}</TableCell>
                    <TableCell>
                      <StatusBadge value={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewStudent(s)}
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
        {students.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{students.length} student{students.length === 1 ? "" : "s"}</span>
            <span className="hidden sm:block">IDs auto-generate as STU-001, STU-002…</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
