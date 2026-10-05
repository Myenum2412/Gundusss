"use client"

import { useEffect, useState } from "react"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, saveGroups } from "@/lib/groups-store"
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

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

const initialForm = {
  groupName: "",
  course: "",
  batch: "",
  feeAmount: "",
  feeFrequency: "Monthly",
  startDate: "",
  endDate: "",
  description: "",
  studentIds: [] as string[],
}

type StudentGroup = typeof initialForm & { groupId: string }

function nextGroupId(n: number) {
  return `GRP-${String(n).padStart(3, "0")}`
}

export default function StudentGroupsPage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [groups, setGroups] = useState<StudentGroup[]>([])
  const [nextId, setNextId] = useState(1)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    const stored = loadGroups()
    if (stored.length > 0) {
      setGroups(stored as StudentGroup[])
      const max = stored.reduce((m, g) => {
        const n = parseInt(g.groupId.replace(/\D/g, ""), 10)
        return Number.isNaN(n) ? m : Math.max(m, n)
      }, 0)
      setNextId(max + 1)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveGroups(groups)
  }, [groups, hydrated])
  const [availableStudents, setAvailableStudents] = useState<StoredStudent[]>(
    []
  )

  useEffect(() => {
    if (open) setAvailableStudents(loadStudents())
  }, [open ])

  function toggleStudent(id: string) {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id)
        ? f.studentIds.filter((s) => s !== id)
        : [...f.studentIds, id],
    }))
  }

  function set(key: Exclude<keyof typeof initialForm, "studentIds">) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: POST to backend when groups API exists.
    const group: StudentGroup = { ...form, groupId: nextGroupId(nextId) }
    setGroups((g) => [...g, group])
    setNextId((n) => n + 1)
    setForm(initialForm)
    setOpen(false)
  }

  function onDelete(index: number) {
    setGroups((g) => g.filter((_, i) => i !== index))
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
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/dashboard/students">
                    Students
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Groups</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Student Groups</h1>
              <p className="text-sm text-muted-foreground">
                Group students by course and batch. Click Create Group to open
                the form popup.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>
                Create Group
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Create Student Group</DialogTitle>
                  <DialogDescription>
                    Fill in group, fee, and schedule details.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex flex-col gap-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="groupName">Group Name</FieldLabel>
                      <Input
                        id="groupName"
                        placeholder="e.g. Science Batch A"
                        value={form.groupName}
                        onChange={set("groupName")}
                        required
                      />
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
                      <FieldLabel htmlFor="batch">Batch / Class</FieldLabel>
                      <Input
                        id="batch"
                        placeholder="e.g. 2026 Batch / Class 10-A"
                        value={form.batch}
                        onChange={set("batch")}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feeAmount">Fee Amount</FieldLabel>
                      <Input
                        id="feeAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="e.g. 5000"
                        value={form.feeAmount}
                        onChange={set("feeAmount")}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feeFrequency">
                        Fee Frequency
                      </FieldLabel>
                      <select
                        id="feeFrequency"
                        className={selectClassName}
                        value={form.feeFrequency}
                        onChange={set("feeFrequency")}
                        required
                      >
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half-Yearly">Half-Yearly</option>
                        <option value="Yearly">Yearly</option>
                        <option value="One-Time">One-Time</option>
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                      <Field>
                        <FieldLabel htmlFor="startDate">Start Date</FieldLabel>
                        <Input
                          id="startDate"
                          type="date"
                          value={form.startDate}
                          onChange={set("startDate")}
                          required
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="endDate">End Date</FieldLabel>
                        <Input
                          id="endDate"
                          type="date"
                          value={form.endDate}
                          onChange={set("endDate")}
                          required
                        />
                      </Field>
                    </div>
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="description">
                        Description
                      </FieldLabel>
                      <textarea
                        id="description"
                        className={textareaClassName}
                        placeholder="Enter group description"
                        value={form.description}
                        onChange={set("description")}
                        rows={3}
                      />
                    </Field>
                    <Field className="md:col-span-2">
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

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                    >
                      Cancel
                    </Button>
                    <Button type="submit">Create Group</Button>
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
                  <TableHead>Group ID</TableHead>
                  <TableHead>Group Name</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Batch / Class</TableHead>
                  <TableHead>Fee Amount</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={11}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No groups yet — click Create Group.
                    </TableCell>
                  </TableRow>
                ) : (
                  groups.map((g, i) => (
                    <TableRow key={`${g.groupId}-${i}`}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{g.groupId}</TableCell>
                      <TableCell className="font-medium">
                        {g.groupName}
                      </TableCell>
                      <TableCell>{g.course}</TableCell>
                      <TableCell>{g.batch}</TableCell>
                      <TableCell>{g.feeAmount}</TableCell>
                      <TableCell>{g.feeFrequency}</TableCell>
                      <TableCell>{g.startDate}</TableCell>
                      <TableCell>{g.endDate}</TableCell>
                      <TableCell
                        title={g.studentIds.join(", ")}
                      >
                        {g.studentIds.length === 0
                          ? "—"
                          : `${g.studentIds.length} selected`}
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
