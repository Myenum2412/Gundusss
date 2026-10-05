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
import { loadGroups, type StoredGroup } from "@/lib/groups-store"

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

const PAYMENT_OPTIONS = ["Cash", "UPI", "Bank Transfer"] as const

const initialForm = {
  structureName: "",
  courseGroup: "",
  feeType: "Tuition Fee",
  amount: "",
  frequency: "Monthly",
  dueDate: "",
  lateFee: "",
  paymentMethods: [] as string[],
  status: "Active",
  description: "",
  studentIds: [] as string[],
}

type FeeStructure = typeof initialForm & { structureId: string }

function nextStructureId(n: number) {
  return `FEE-${String(n).padStart(3, "0")}`
}

export function FeeStructurePage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [structures, setStructures] = useState<FeeStructure[]>([])
  const [nextId, setNextId] = useState(1)
  const [availableStudents, setAvailableStudents] = useState<StoredStudent[]>(
    []
  )
  const [availableGroups, setAvailableGroups] = useState<StoredGroup[]>([])

  useEffect(() => {
    if (open) {
      setAvailableStudents(loadStudents())
      setAvailableGroups(loadGroups())
    }
  }, [open])

  function set(key: Exclude<keyof typeof initialForm, "paymentMethods" | "studentIds">) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  function toggleMethod(method: string) {
    setForm((f) => ({
      ...f,
      paymentMethods: f.paymentMethods.includes(method)
        ? f.paymentMethods.filter((m) => m !== method)
        : [...f.paymentMethods, method],
    }))
  }

  function toggleStudent(id: string) {
    setForm((f) => ({
      ...f,
      studentIds: f.studentIds.includes(id)
        ? f.studentIds.filter((s) => s !== id)
        : [...f.studentIds, id],
    }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    // TODO: POST to backend when fee-structure API exists.
    const structure: FeeStructure = {
      ...form,
      structureId: nextStructureId(nextId),
    }
    setStructures((s) => [...s, structure])
    setNextId((n) => n + 1)
    setForm(initialForm)
    setOpen(false)
  }

  function onDelete(index: number) {
    setStructures((s) => s.filter((_, i) => i !== index))
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
                  <BreadcrumbPage>Fee Structure</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Fee Structure</h1>
              <p className="text-sm text-muted-foreground">
                Define fee heads and assign students. Click Save Fee Structure
                flow via the popup.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>
                New Fee Structure
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Fee Structure</DialogTitle>
                  <DialogDescription>
                    Fill in structure details and select students.
                  </DialogDescription>
                </DialogHeader>

                <form onSubmit={onSubmit} className="flex flex-col gap-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="structureName">
                        Structure Name
                      </FieldLabel>
                      <Input
                        id="structureName"
                        placeholder="e.g. Class 10 Tuition 2026"
                        value={form.structureName}
                        onChange={set("structureName")}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="courseGroup">
                        Course / Group
                      </FieldLabel>
                      <select
                        id="courseGroup"
                        className={selectClassName}
                        value={form.courseGroup}
                        onChange={set("courseGroup")}
                        required
                      >
                        <option value="" disabled>
                          Select Course / Group
                        </option>
                        <optgroup label="Courses">
                          <option value="Science">Science</option>
                          <option value="Commerce">Commerce</option>
                          <option value="Arts">Arts</option>
                          <option value="General">General</option>
                        </optgroup>
                        {availableGroups.length > 0 && (
                          <optgroup label="Student Groups">
                            {availableGroups.map((g) => (
                              <option
                                key={g.groupId}
                                value={`${g.groupName} (${g.groupId})`}
                              >
                                {g.groupName} ({g.groupId})
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="feeType">Fee Type</FieldLabel>
                      <select
                        id="feeType"
                        className={selectClassName}
                        value={form.feeType}
                        onChange={set("feeType")}
                        required
                      >
                        <option value="Tuition Fee">Tuition Fee</option>
                        <option value="Admission Fee">Admission Fee</option>
                        <option value="Exam Fee">Exam Fee</option>
                        <option value="Transport Fee">Transport Fee</option>
                        <option value="Library Fee">Library Fee</option>
                        <option value="Hostel Fee">Hostel Fee</option>
                        <option value="Other">Other</option>
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="amount">Amount (₹)</FieldLabel>
                      <Input
                        id="amount"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="₹ Enter amount"
                        value={form.amount}
                        onChange={set("amount")}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="frequency">Frequency</FieldLabel>
                      <select
                        id="frequency"
                        className={selectClassName}
                        value={form.frequency}
                        onChange={set("frequency")}
                        required
                      >
                        <option value="Monthly">Monthly</option>
                        <option value="Quarterly">Quarterly</option>
                        <option value="Half-Yearly">Half-Yearly</option>
                        <option value="Yearly">Yearly</option>
                        <option value="One-Time">One-Time</option>
                      </select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="dueDate">Due Date</FieldLabel>
                      <Input
                        id="dueDate"
                        placeholder="e.g. Every month: 5th"
                        value={form.dueDate}
                        onChange={set("dueDate")}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="lateFee">Late Fee (₹)</FieldLabel>
                      <Input
                        id="lateFee"
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="₹ Enter late fee"
                        value={form.lateFee}
                        onChange={set("lateFee")}
                        required
                      />
                    </Field>
                    <Field>
                      <FieldLabel>Payment Methods</FieldLabel>
                      <div className="flex flex-wrap gap-4 rounded-lg border border-input px-3 py-2">
                        {PAYMENT_OPTIONS.map((m) => (
                          <label
                            key={m}
                            className="flex cursor-pointer items-center gap-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={form.paymentMethods.includes(m)}
                              onChange={() => toggleMethod(m)}
                            />
                            {m}
                          </label>
                        ))}
                      </div>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="status">Status</FieldLabel>
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
                    <Field className="md:col-span-2">
                      <FieldLabel htmlFor="description">
                        Description
                      </FieldLabel>
                      <textarea
                        id="description"
                        className={textareaClassName}
                        placeholder="Enter description"
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
                    <Button type="submit">Save Fee Structure</Button>
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
                  <TableHead>Structure ID</TableHead>
                  <TableHead>Structure Name</TableHead>
                  <TableHead>Course / Group</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Amount (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {structures.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No fee structures yet — click New Fee Structure.
                    </TableCell>
                  </TableRow>
                ) : (
                  structures.map((s, i) => (
                    <TableRow key={`${s.structureId}-${i}`}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{s.structureId}</TableCell>
                      <TableCell className="font-medium">
                        {s.structureName}
                      </TableCell>
                      <TableCell>{s.courseGroup}</TableCell>
                      <TableCell>{s.feeType}</TableCell>
                      <TableCell>₹ {s.amount}</TableCell>
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
