"use client"

import { useEffect, useState } from "react"
import { loadStudents, saveStudents } from "@/lib/students-store"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

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
                  <BreadcrumbPage>Students</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Students</h1>
              <p className="text-sm text-muted-foreground">
                Manage students. Click Add Student to open the form popup.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>Add Student</DialogTrigger>
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
                  <div>
                    <h2 className="text-sm font-semibold">
                      Student Information
                    </h2>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
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
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </Field>
                    </div>
                  </div>

                  <Separator />

                  {/* Contact Information */}
                  <div>
                    <h2 className="text-sm font-semibold">
                      Contact Information
                    </h2>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
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

                  <Separator />

                  {/* Academic Information */}
                  <div>
                    <h2 className="text-sm font-semibold">
                      Academic Information
                    </h2>
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
                          <option value="Class 1">Class 1</option>
                          <option value="Class 2">Class 2</option>
                          <option value="Class 3">Class 3</option>
                          <option value="Group A">Group A</option>
                          <option value="Group B">Group B</option>
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
                          <option value="Science">Science</option>
                          <option value="Commerce">Commerce</option>
                          <option value="Arts">Arts</option>
                          <option value="General">General</option>
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
                          <option value="Active">Active</option>
                          <option value="Inactive">Inactive</option>
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
          </div>

          <div className="rounded-xl border bg-card text-card-foreground">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sno</TableHead>
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
                  <TableRow>
                    <TableCell
                      colSpan={9}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No students yet — click Add Student.
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((s, i) => (
                    <TableRow key={`${s.studentId}-${i}`}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        {s.studentName}
                      </TableCell>
                      <TableCell>{s.studentId}</TableCell>
                      <TableCell>{s.group}</TableCell>
                      <TableCell>{s.course}</TableCell>
                      <TableCell>{s.phone}</TableCell>
                      <TableCell>{s.joiningDate}</TableCell>
                      <TableCell>{s.status}</TableCell>
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
