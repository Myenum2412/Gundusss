"use client"

import { useEffect, useState } from "react"
import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { loadStudents, saveStudents } from "@/lib/students-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
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

const selectClassName =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-xs transition-all duration-200 outline-none hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

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

  useEffect(() => {
    if (open) setDropdowns(loadDropdowns())
  }, [open])

  useEffect(() => {
    const stored = loadStudents()
    if (stored.length > 0) {
      setStudents(stored as Student[])
      const max = stored.reduce((m, s) => {
        const n = parseInt(s.studentId.replace(/\D/g, ""), 10)
        return Number.isNaN(n) ? m : Math.max(m, n)
      }, 0)
      setNextId(max + 1)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveStudents(students)
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
    // TODO: POST to backend when students API exists.
    // Student ID is auto-generated (STU-001, STU-002, ...).
    const student: Student = { ...form, studentId: nextStudentId(nextId) }
    setStudents((s) => [...s, student])
    setNextId((n) => n + 1)
    setForm(initialForm)
    setOpen(false)
  }

  function onDelete(index: number) {
    setStudents((s) => s.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setOpen(false)
  }

  return (
    <DashboardShell
      crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Students" }]}
      title="Students"
      description={`${students.length} enrolled · IDs auto-generated in STU sequence. Add, review, and manage every learner from one place.`}
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" /> Add Student
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add Student</DialogTitle>
              <DialogDescription>
                Fill in student, contact, and academic details including
                joining date.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="flex flex-col gap-6">
              {/* Student Information */}
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
                <h2 className="text-[13px] font-semibold tracking-tight">
                  Student Information
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="studentName">
                      Student Name
                    </FieldLabel>
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

              {/* Contact Information */}
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
                <h2 className="text-[13px] font-semibold tracking-tight">
                  Contact Information
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="guardian">
                      Parent / Guardian
                    </FieldLabel>
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

              {/* Academic Information */}
              <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 sm:p-5">
                <h2 className="text-[13px] font-semibold tracking-tight">
                  Academic Information
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                    <FieldLabel htmlFor="joiningDate">
                      Joining Date
                    </FieldLabel>
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

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Student</Button>
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
              <TableHead>Student Name</TableHead>
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
                    icon={<UsersIcon />}
                    title="No students yet"
                    description="Add your first student — an STU ID is generated automatically and unlocks groups, structures, and receipts."
                    action={
                      <Button size="sm" onClick={() => setOpen(true)}>
                        <PlusIcon data-icon="inline-start" /> Add Student
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              students.map((s, i) => (
                <TableRow key={`${s.studentId}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="font-medium text-foreground">
                    {s.studentName}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                      {s.studentId}
                    </span>
                  </TableCell>
                  <TableCell>{s.group}</TableCell>
                  <TableCell>{s.course}</TableCell>
                  <TableCell className="tabular-nums">{s.phone}</TableCell>
                  <TableCell className="tabular-nums">{s.joiningDate}</TableCell>
                  <TableCell>
                    <StatusBadge status={s.status} />
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
