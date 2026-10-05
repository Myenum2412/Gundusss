"use client"

import { useCallback, useEffect, useState } from "react"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, saveGroups } from "@/lib/groups-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
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
import { LayersIcon, PlusIcon } from "lucide-react"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

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

  const reloadGroups = useCallback(() => {
    if (isSyncing()) return
    loadGroups().then((stored) => {
      if (isSyncing()) return
      setGroups((prev) =>
        sameJson(prev, stored) ? prev : (stored as StudentGroup[])
      )
      if (stored.length > 0) {
        const max = stored.reduce((m, g) => {
          const n = parseInt(g.groupId.replace(/\D/g, ""), 10)
          return Number.isNaN(n) ? m : Math.max(m, n)
        }, 0)
        setNextId((n) => Math.max(n, max + 1))
      }
      setHydrated(true)
    })
    loadStudents().then((rows) => {
      if (isSyncing()) return
      setAllStudents((prev) => (sameJson(prev, rows) ? prev : rows))
    })
  }, [])

  useEffect(() => {
    reloadGroups()
  }, [reloadGroups])

  useLiveReload(reloadGroups)

  useEffect(() => {
    if (hydrated) void saveGroups(groups)
  }, [groups, hydrated])
  const [availableStudents, setAvailableStudents] = useState<StoredStudent[]>(
    []
  )
  const [allStudents, setAllStudents] = useState<StoredStudent[]>([])
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [viewGroup, setViewGroup] = useState<StudentGroup | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      loadStudents().then(setAvailableStudents)
      loadDropdowns().then(setDropdowns)
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
    // Persisted to Postgres via the save effect.
    if (editingIndex !== null) {
      const id = groups[editingIndex]?.groupId ?? nextGroupId(nextId)
      const updated: StudentGroup = { ...form, groupId: id }
      setGroups((prev) => prev.map((g, i) => (i === editingIndex ? updated : g)))
      setEditingIndex(null)
    } else {
      const group: StudentGroup = { ...form, groupId: nextGroupId(nextId) }
      setGroups((g) => [...g, group])
      setNextId((n) => n + 1)
    }
    setForm(initialForm)
    setOpen(false)
  }

  function openEdit(index: number) {
    const g = groups[index]
    if (!g) return
    const { groupId, ...rest } = g
    void groupId
    setForm(rest)
    setEditingIndex(index)
    setOpen(true)
  }

  function onDelete(index: number) {
    setGroups((g) => g.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const assigned = groups.reduce((sum, g) => sum + (g.studentIds?.length ?? 0), 0)
  const assignedIds = new Set(groups.flatMap((g) => g.studentIds ?? []))
  const ungrouped = allStudents.filter((s) => !assignedIds.has(s.studentId)).length
  const avgSize = groups.length === 0 ? 0 : assigned / groups.length
  const largest = groups.reduce((m, g) => Math.max(m, g.studentIds?.length ?? 0), 0)
  const newThisMonth = groups.filter((g) => (g.startDate ?? "").slice(0, 7) === nowKey).length
  const stats = [
    {
      name: "Total groups",
      value: String(groups.length),
      ...momTrend(groups.map((g) => ({ date: g.startDate }))),
    },
    {
      name: "Students assigned",
      value: String(assigned),
      change: `${ungrouped} unassigned`,
      changeType: "neutral" as const,
    },
    {
      name: "Avg. group size",
      value: avgSize % 1 === 0 ? String(avgSize) : avgSize.toFixed(1),
      change: `largest ${largest}`,
      changeType: "neutral" as const,
    },
    {
      name: "New this month",
      value: String(newThisMonth),
      ...momTrend(groups.map((g) => ({ date: g.startDate }))),
    },
  ]

  return (
    <DashboardShell
      trail={[
        { label: "Dashboard", href: "/dashboard" },
        { label: "Students", href: "/dashboard/students" },
        { label: "Groups" },
      ]}
    >
      <PageHeader
        title="Student Groups"
        description="Group students by course and batch, with a shared fee and schedule."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {groups.length} total
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
              Create Group
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {editingIndex !== null ? "Edit student group" : "Create student group"}
                </DialogTitle>
                <DialogDescription>
                  {editingIndex !== null
                    ? "Update the group details below."
                    : "Group, fee, and schedule details. Group ID is auto-generated."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col">
                <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
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
                    <FieldLabel htmlFor="feeFrequency">Fee Frequency</FieldLabel>
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
                    <FieldLabel htmlFor="description">Description</FieldLabel>
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
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingIndex !== null ? "Save Changes" : "Create Group"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={viewGroup !== null}
            onOpenChange={(v) => {
              if (!v) setViewGroup(null)
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Group details
                </DialogTitle>
                <DialogDescription>
                  {viewGroup?.groupName} · {viewGroup?.groupId}
                </DialogDescription>
              </DialogHeader>
              {viewGroup && (
                <div className="px-6 py-5">
                  <DetailList>
                    <DetailItem label="Group Name">{viewGroup.groupName}</DetailItem>
                    <DetailItem label="Group ID">{viewGroup.groupId}</DetailItem>
                    <DetailItem label="Course">{viewGroup.course || "—"}</DetailItem>
                    <DetailItem label="Batch / Class">{viewGroup.batch || "—"}</DetailItem>
                    <DetailItem label="Fee Amount">{viewGroup.feeAmount ? `₹ ${viewGroup.feeAmount}` : "—"}</DetailItem>
                    <DetailItem label="Fee Frequency">{viewGroup.feeFrequency || "—"}</DetailItem>
                    <DetailItem label="Start Date">{viewGroup.startDate || "—"}</DetailItem>
                    <DetailItem label="End Date">{viewGroup.endDate || "—"}</DetailItem>
                    <DetailItem label="Description">{viewGroup.description || "—"}</DetailItem>
                    <DetailItem label="Students">
                      {viewGroup.studentIds.length === 0
                        ? "—"
                        : `${viewGroup.studentIds.length} selected (${viewGroup.studentIds.join(", ")})`}
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
            title="Delete group?"
            description={`${groups[deleteIndex ?? -1]?.groupName ?? "This group"} (${groups[deleteIndex ?? -1]?.groupId ?? ""}) will be permanently removed from the database. This action cannot be undone.`}
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
                      icon={LayersIcon}
                      title="No groups yet"
                      hint="Click Create Group above to bundle students by course and batch."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                groups.map((g, i) => (
                  <TableRow key={`${g.groupId}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{g.groupId}</TableCell>
                    <TableCell className="font-medium text-foreground">{g.groupName}</TableCell>
                    <TableCell>{g.course}</TableCell>
                    <TableCell>{g.batch}</TableCell>
                    <TableCell className="tabular-nums">₹ {g.feeAmount}</TableCell>
                    <TableCell>{g.feeFrequency}</TableCell>
                    <TableCell className="tabular-nums">{g.startDate}</TableCell>
                    <TableCell className="tabular-nums">{g.endDate}</TableCell>
                    <TableCell title={g.studentIds.join(", ")}>
                      {g.studentIds.length === 0 ? <span className="text-muted-foreground">—</span> : `${g.studentIds.length} selected`}
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewGroup(g)}
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
        {groups.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{groups.length} group{groups.length === 1 ? "" : "s"}</span>
            <span className="hidden sm:block">Assign groups when creating fee structures</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
