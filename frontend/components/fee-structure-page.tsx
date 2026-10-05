"use client"

import { useCallback, useEffect, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import { EmptyState } from "@/components/empty-state"
import Stats01 from "@/components/stats-01"
import { RowActions } from "@/components/row-actions"
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog"
import { DetailItem, DetailList } from "@/components/detail-list"
import { LiveBadge } from "@/components/live-badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import {
  loadFeeStructures,
  saveFeeStructures,
} from "@/lib/fee-structures-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
import { ClipboardListIcon, PlusIcon } from "lucide-react"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

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
  const [hydrated, setHydrated] = useState(false)
  const [availableStudents, setAvailableStudents] = useState<StoredStudent[]>(
    []
  )
  const [availableGroups, setAvailableGroups] = useState<StoredGroup[]>([])
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [viewStructure, setViewStructure] = useState<FeeStructure | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  const reloadStructures = useCallback(() => {
    if (isSyncing()) return
    loadFeeStructures().then((stored) => {
      if (isSyncing()) return
      setStructures((prev) =>
        sameJson(prev, stored) ? prev : (stored as FeeStructure[])
      )
      if (stored.length > 0) {
        const max = stored.reduce((m, s) => {
          const n = parseInt(s.structureId.replace(/\D/g, ""), 10)
          return Number.isNaN(n) ? m : Math.max(m, n)
        }, 0)
        setNextId((n) => Math.max(n, max + 1))
      }
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    reloadStructures()
  }, [reloadStructures])

  useLiveReload(reloadStructures)

  useEffect(() => {
    if (hydrated) void saveFeeStructures(structures)
  }, [structures, hydrated])

  useEffect(() => {
    if (open) {
      loadStudents().then(setAvailableStudents)
      loadGroups().then(setAvailableGroups)
      loadDropdowns().then(setDropdowns)
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
    // Persisted to Postgres via the save effect.
    if (editingIndex !== null) {
      const id = structures[editingIndex]?.structureId ?? nextStructureId(nextId)
      const updated: FeeStructure = {
        ...form,
        structureId: id,
      }
      setStructures((prev) => prev.map((s, i) => (i === editingIndex ? updated : s)))
      setEditingIndex(null)
    } else {
      const structure: FeeStructure = {
        ...form,
        structureId: nextStructureId(nextId),
      }
      setStructures((s) => [...s, structure])
      setNextId((n) => n + 1)
    }
    setForm(initialForm)
    setOpen(false)
  }

  function openEdit(index: number) {
    const s = structures[index]
    if (!s) return
    const { structureId, ...rest } = s
    void structureId
    setForm(rest)
    setEditingIndex(index)
    setOpen(true)
  }

  function onDelete(index: number) {
    setStructures((s) => s.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  const activeStructures = structures.filter((s) => s.status === "Active")
  const combinedValue = structures.reduce((sum, s) => sum + (parseFloat(String(s.amount)) || 0), 0)
  const studentsCovered = structures.reduce((sum, s) => sum + (s.studentIds?.length ?? 0), 0)
  const feeTypes = new Set(structures.map((s) => s.feeType).filter(Boolean)).size
  const methods = new Set(structures.flatMap((s) => s.paymentMethods ?? [])).size
  const stats = [
    {
      name: "Total structures",
      value: String(structures.length),
      change: `${activeStructures.length} active`,
      changeType: "neutral" as const,
    },
    {
      name: "Combined value",
      value: `₹ ${combinedValue.toLocaleString("en-IN")}`,
      change: `${feeTypes} fee types`,
      changeType: "neutral" as const,
    },
    {
      name: "Students assigned",
      value: String(studentsCovered),
      change: `across ${structures.length} structures`,
      changeType: "neutral" as const,
    },
    {
      name: "Payment methods",
      value: String(methods),
      change: "accepted overall",
      changeType: "neutral" as const,
    },
  ]

  return (
    <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Fee Structure" }]}>
      <PageHeader
        title="Fee Structure"
        description="Define fee heads once, then assign students in bulk."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {structures.length} total
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
              New Fee Structure
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {editingIndex !== null ? "Edit Fee Structure" : "Fee Structure"}
                </DialogTitle>
                <DialogDescription>
                  {editingIndex !== null
                    ? "Update the structure details below."
                    : "Fill in structure details and select students."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col">
                <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="structureName">Structure Name</FieldLabel>
                    <Input
                      id="structureName"
                      placeholder="e.g. Class 10 Tuition 2026"
                      value={form.structureName}
                      onChange={set("structureName")}
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="courseGroup">Course / Group</FieldLabel>
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
                            <option key={g.groupId} value={`${g.groupName} (${g.groupId})`}>
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
                    <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-[10px] border border-input bg-card px-3 py-2.5">
                      {(dropdowns?.paymentMethod ?? []).map((m) => (
                        <label key={m} className="flex cursor-pointer items-center gap-1.5 text-sm">
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
                      {(dropdowns?.studentStatus ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="description">Description</FieldLabel>
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
                    <FieldLabel>Students ({form.studentIds.length} selected)</FieldLabel>
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
                    {editingIndex !== null ? "Save Changes" : "Save Fee Structure"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={viewStructure !== null}
            onOpenChange={(v) => {
              if (!v) setViewStructure(null)
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Fee structure details
                </DialogTitle>
                <DialogDescription>
                  {viewStructure?.structureName} · {viewStructure?.structureId}
                </DialogDescription>
              </DialogHeader>
              {viewStructure && (
                <div className="px-6 py-5">
                  <DetailList>
                    <DetailItem label="Structure Name">{viewStructure.structureName}</DetailItem>
                    <DetailItem label="Structure ID">{viewStructure.structureId}</DetailItem>
                    <DetailItem label="Course / Group">{viewStructure.courseGroup || "—"}</DetailItem>
                    <DetailItem label="Fee Type">{viewStructure.feeType || "—"}</DetailItem>
                    <DetailItem label="Amount">{viewStructure.amount ? `₹ ${viewStructure.amount}` : "—"}</DetailItem>
                    <DetailItem label="Frequency">{viewStructure.frequency || "—"}</DetailItem>
                    <DetailItem label="Due Date">{viewStructure.dueDate || "—"}</DetailItem>
                    <DetailItem label="Late Fee">{viewStructure.lateFee ? `₹ ${viewStructure.lateFee}` : "—"}</DetailItem>
                    <DetailItem label="Payment Methods">
                      {viewStructure.paymentMethods.length === 0 ? "—" : viewStructure.paymentMethods.join(", ")}
                    </DetailItem>
                    <DetailItem label="Status">
                      <StatusBadge value={viewStructure.status} />
                    </DetailItem>
                    <DetailItem label="Description">{viewStructure.description || "—"}</DetailItem>
                    <DetailItem label="Students">
                      {viewStructure.studentIds.length === 0
                        ? "—"
                        : `${viewStructure.studentIds.length} selected (${viewStructure.studentIds.join(", ")})`}
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
            title="Delete fee structure?"
            description={`${structures[deleteIndex ?? -1]?.structureName ?? "This structure"} (${structures[deleteIndex ?? -1]?.structureId ?? ""}) will be permanently removed from the database. This action cannot be undone.`}
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
                      icon={ClipboardListIcon}
                      title="No fee structures yet"
                      hint="Click New Fee Structure above to define your first fee head."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                structures.map((s, i) => (
                  <TableRow key={`${s.structureId}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.structureId}</TableCell>
                    <TableCell className="font-medium text-foreground">{s.structureName}</TableCell>
                    <TableCell>{s.courseGroup}</TableCell>
                    <TableCell>{s.feeType}</TableCell>
                    <TableCell className="tabular-nums">₹ {s.amount}</TableCell>
                    <TableCell>
                      <StatusBadge value={s.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewStructure(s)}
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
        {structures.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{structures.length} structure{structures.length === 1 ? "" : "s"}</span>
            <span className="hidden sm:block">IDs auto-generate as FEE-001, FEE-002…</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
