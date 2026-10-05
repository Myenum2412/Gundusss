"use client"

import { useEffect, useState } from "react"
import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, saveGroups } from "@/lib/groups-store"
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
import { EmptyState, TableCard } from "@/components/empty-state"
import { StatusBadge } from "@/components/status-badge"

const selectClassName =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-xs transition-all duration-200 outline-none hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-xs transition-all duration-200 outline-none placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

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
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)

  useEffect(() => {
    if (open) {
      setAvailableStudents(loadStudents())
      setDropdowns(loadDropdowns())
    }
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
    <DashboardShell
      crumbs={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Students", href: "/dashboard/students" },
        { label: "Groups" },
      ]}
      title="Student Groups"
      description={`${groups.length} groups · organize students by course, batch, and schedule with per-group fees.`}
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" /> Create Group
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
                    {(dropdowns?.course ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
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
                    {(dropdowns?.feeFrequency ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
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
                <Button type="submit">Create Group</Button>
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={11} className="p-0">
                  <EmptyState
                    icon={<UsersIcon />}
                    title="No groups yet"
                    description="Create batches by course and schedule — then assign students in one click."
                    action={
                      <Button size="sm" onClick={() => setOpen(true)}>
                        <PlusIcon data-icon="inline-start" /> Create Group
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              groups.map((g, i) => (
                <TableRow key={`${g.groupId}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{g.groupId}</span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {g.groupName}
                  </TableCell>
                  <TableCell>{g.course}</TableCell>
                  <TableCell>{g.batch}</TableCell>
                  <TableCell className="tabular-nums">₹{g.feeAmount}</TableCell>
                  <TableCell>
                    <StatusBadge status={g.feeFrequency} />
                  </TableCell>
                  <TableCell className="tabular-nums">{g.startDate}</TableCell>
                  <TableCell className="tabular-nums">{g.endDate}</TableCell>
                  <TableCell
                    title={g.studentIds.join(", ")}
                  >
                    {g.studentIds.length === 0
                      ? <span className="text-muted-foreground">—</span>
                      : <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{g.studentIds.length} selected</span>}
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
