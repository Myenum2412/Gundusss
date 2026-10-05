"use client"

import { useEffect, useState } from "react"
import { ClipboardListIcon, PlusIcon, Trash2Icon } from "lucide-react"
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
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"

const selectClassName =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-xs transition-all duration-200 outline-none hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-xs transition-all duration-200 outline-none placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

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
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)

  useEffect(() => {
    if (open) {
      setAvailableStudents(loadStudents())
      setAvailableGroups(loadGroups())
      setDropdowns(loadDropdowns())
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
    <DashboardShell
      crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Fee Structure" }]}
      title="Fee Structure"
      description={`${structures.length} structures defined · compose fee heads, frequencies, and student assignments.`}
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" /> New Fee Structure
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
                      {(dropdowns?.course ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
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
                    {(dropdowns?.feeType ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
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
                    {(dropdowns?.feeFrequency ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
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
                  <div className="flex flex-wrap gap-2 rounded-xl border border-input bg-card p-3 shadow-xs">
                    {(dropdowns?.paymentMethod ?? []).map((m) => (
                      <label
                        key={m}
                        className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-all duration-150 ${form.paymentMethods.includes(m) ? "border-primary/40 bg-primary/8 text-primary" : "border-border bg-muted/40 hover:bg-muted"}`}
                      >
                        <input
                          type="checkbox"
                          className="size-3.5 accent-primary"
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
                    {(dropdowns?.studentStatus ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
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
      }
    >
      <TableCard>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="w-12">Sno</TableHead>
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={8} className="p-0">
                  <EmptyState
                    icon={<ClipboardListIcon />}
                    title="No fee structures yet"
                    description="Define tuition heads with amounts, frequencies, and late fees — then assign students."
                    action={
                      <Button size="sm" onClick={() => setOpen(true)}>
                        <PlusIcon data-icon="inline-start" /> New Fee Structure
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              structures.map((s, i) => (
                <TableRow key={`${s.structureId}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{s.structureId}</span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {s.structureName}
                  </TableCell>
                  <TableCell>{s.courseGroup}</TableCell>
                  <TableCell>{s.feeType}</TableCell>
                  <TableCell className="font-semibold tabular-nums">₹ {s.amount}</TableCell>
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
