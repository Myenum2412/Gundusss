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
import { Checkbox } from "@/components/ui/checkbox"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import { loadBranches, type StoredBranch } from "@/lib/branches-store"
import {
  loadFeeStructures,
  saveFeeStructures,
} from "@/lib/fee-structures-store"
import {
  loadReceipts,
  type StoredReceipt,
} from "@/lib/receipts-store"
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
  branch: "",
  courseGroup: "",
  feeType: "Tuition Fee",
  amount: "",
  frequency: "Monthly",
  dueDate: "",
  lateFee: "",
  paymentMethods: [] as string[],
  status: "Unpaid",
  description: "",
  studentIds: [] as string[],
}

type FeeStructure = typeof initialForm & { structureId: string }

function nextStructureId(n: number) {
  return `FEE-${String(n).padStart(3, "0")}`
}

function getStructureStatus(
  structure: FeeStructure,
  receiptsList: StoredReceipt[]
): "Paid" | "Unpaid" {
  const st = (structure.status || "").toLowerCase().trim()
  if (st === "paid") return "Paid"
  if (st === "unpaid") return "Unpaid"

  const hasPaid = receiptsList.some((r) => {
    const isPaid = (r.status || "").toLowerCase() === "paid"
    if (!isPaid) return false
    if (structure.studentIds?.length && structure.studentIds.includes(r.studentId)) return true
    if (
      r.notes &&
      (r.notes.includes(structure.structureId) || r.notes.includes(structure.structureName))
    )
      return true
    return false
  })
  return hasPaid ? "Paid" : "Unpaid"
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
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [branches, setBranches] = useState<StoredBranch[]>([])
  const [formError, setFormError] = useState("")
  const [viewStructure, setViewStructure] = useState<FeeStructure | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)

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
    }).catch((error) => {
      console.error("Failed to load fee structures", error)
    })
  }, [])

  useEffect(() => {
    reloadStructures()
  }, [reloadStructures])

  useLiveReload(reloadStructures)

  const reloadDependencies = useCallback(() => {
    loadBranches()
      .then(setBranches)
      .catch((error) => console.error("Failed to load branches", error))
    loadStudents()
      .then(setAvailableStudents)
      .catch((error) => console.error("Failed to load students", error))
    loadGroups()
      .then(setAvailableGroups)
      .catch((error) => console.error("Failed to load student groups", error))
    loadReceipts()
      .then(setReceipts)
      .catch((error) => console.error("Failed to load receipts", error))
    loadDropdowns()
      .then(setDropdowns)
      .catch((error) => console.error("Failed to load dropdown options", error))
  }, [])

  useEffect(() => {
    reloadDependencies()
  }, [reloadDependencies])

  useEffect(() => {
    if (open) {
      reloadDependencies()
    }
  }, [open, reloadDependencies])

  function set(key: Exclude<keyof typeof initialForm, "paymentMethods" | "studentIds">) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  function handleCourseGroupChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const matchedGroup = availableGroups.find(
      (g) => `${g.groupName} (${g.groupId})` === val || g.groupName === val || g.groupId === val
    )
    setForm((f) => {
      // Find students matching this course/group
      const autoStudentIds = matchedGroup
        ? matchedGroup.studentIds
        : availableStudents
            .filter((s) => (s.course && val.toLowerCase().includes(s.course.toLowerCase())) || (s.group && val.toLowerCase().includes(s.group.toLowerCase())))
            .map((s) => s.studentId)

      return {
        ...f,
        courseGroup: val,
        amount: matchedGroup?.feeAmount && (!f.amount || f.amount === "0") ? matchedGroup.feeAmount : f.amount,
        frequency: matchedGroup?.feeFrequency && f.frequency === "Monthly" ? matchedGroup.feeFrequency : f.frequency,
        studentIds: f.studentIds.length === 0 && autoStudentIds.length > 0 ? autoStudentIds : f.studentIds,
      }
    })
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
    const trimmedBranch = (form.branch || "").trim()
    if (!trimmedBranch) {
      setFormError("Branch is required. A fee structure cannot be created without a branch.")
      return
    }
    setFormError("")
    let assignedId = ""
    if (editingIndex !== null) {
      assignedId = structures[editingIndex]?.structureId ?? nextStructureId(nextId)
      const updated: FeeStructure = {
        ...form,
        branch: trimmedBranch,
        structureId: assignedId,
      }
      const nextList = structures.map((s, i) => (i === editingIndex ? updated : s))
      setStructures(nextList)
      void saveFeeStructures(nextList)
      setEditingIndex(null)
    } else {
      assignedId = nextStructureId(nextId)
      const structure: FeeStructure = {
        ...form,
        branch: trimmedBranch,
        structureId: assignedId,
      }
      const nextList = [...structures, structure]
      setStructures(nextList)
      void saveFeeStructures(nextList)
      setNextId((n) => n + 1)
    }
    setForm(initialForm)
    setFormError("")
    setOpen(false)
  }

  function openEdit(index: number) {
    const s = structures[index]
    if (!s) return
    const { structureId, ...rest } = s
    void structureId
    setForm({
      ...rest,
      branch: rest.branch || "",
    })
    setEditingIndex(index)
    setFormError("")
    setOpen(true)
  }

  function onDelete(index: number) {
    const s = structures[index]
    const nextList = structures.filter((_, i) => i !== index)
    setStructures(nextList)
    void saveFeeStructures(nextList)
    if (s?.structureId && selectedIds.has(s.structureId)) {
      const nextSel = new Set(selectedIds)
      nextSel.delete(s.structureId)
      setSelectedIds(nextSel)
    }
  }

  function onDeleteSelected() {
    const nextList = structures.filter((s) => !selectedIds.has(s.structureId))
    setStructures(nextList)
    void saveFeeStructures(nextList)
    setSelectedIds(new Set())
  }

  function onDeleteAll() {
    setStructures([])
    void saveFeeStructures([])
    setSelectedIds(new Set())
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  const paidStructures = structures.filter((s) => getStructureStatus(s, receipts) === "Paid")
  const unpaidStructures = structures.filter((s) => getStructureStatus(s, receipts) === "Unpaid")
  const combinedValue = structures.reduce((sum, s) => sum + (parseFloat(String(s.amount)) || 0), 0)
  const studentsCovered = structures.reduce((sum, s) => sum + (s.studentIds?.length ?? 0), 0)
  const feeTypes = new Set(structures.map((s) => s.feeType).filter(Boolean)).size
  const stats = [
    {
      name: "Total structures",
      value: String(structures.length),
      change: `${paidStructures.length} paid · ${unpaidStructures.length} unpaid`,
      changeType: "neutral" as const,
    },
    {
      name: "Combined value",
      value: `₹ ${combinedValue.toLocaleString("en-IN")}`,
      change: `${feeTypes} fee types`,
      changeType: "neutral" as const,
    },
    {
      name: "Paid structures",
      value: String(paidStructures.length),
      change: `${unpaidStructures.length} pending unpaid`,
      changeType: "neutral" as const,
    },
    {
      name: "Students assigned",
      value: String(studentsCovered),
      change: `across ${structures.length} structures`,
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
          <div className="flex flex-wrap items-center gap-2">
            {selectedIds.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteSelected(true)}
              >
                Delete Selected ({selectedIds.size})
              </Button>
            )}
            {structures.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmDeleteAll(true)}
                className="text-destructive hover:bg-destructive/10"
              >
                Delete All
              </Button>
            )}
          <Dialog
            open={open}
            onOpenChange={(v) => {
              if (!v) {
                setForm(initialForm)
                setEditingIndex(null)
                setFormError("")
              } else if (editingIndex === null) {
                const activeBranches = branches.filter((b) => b.status === "Active")
                if (activeBranches.length === 1 && !form.branch) {
                  setForm((f) => ({ ...f, branch: activeBranches[0].branchName }))
                }
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
                  {formError && (
                    <div className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-xs font-medium text-destructive md:col-span-2">
                      {formError}
                    </div>
                  )}
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
                    <FieldLabel htmlFor="branch">
                      Branch <span className="text-destructive">*</span>
                    </FieldLabel>
                    <select
                      id="branch"
                      className={selectClassName}
                      value={form.branch}
                      onChange={(e) => {
                        setFormError("")
                        set("branch")(e)
                      }}
                      required
                    >
                      <option value="" disabled>
                        Select Branch (Required)
                      </option>
                      {branches
                        .filter((b) => b.status === "Active")
                        .map((b) => (
                          <option key={b.branchId} value={b.branchName}>
                            {b.branchName}
                          </option>
                        ))}
                    </select>
                    {branches.filter((b) => b.status === "Active").length === 0 ? (
                      <p className="text-xs text-destructive">
                        No active branches found. You must create an active branch on the Branches page before adding fee structures.
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Every fee structure must be assigned to an active branch.
                      </p>
                    )}
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="courseGroup">Course / Group</FieldLabel>
                    <select
                      id="courseGroup"
                      className={selectClassName}
                      value={form.courseGroup}
                      onChange={handleCourseGroupChange}
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

                  {/* Connected Course / Group Preview */}
                  {(() => {
                    const matchedGroup = availableGroups.find(
                      (g) => `${g.groupName} (${g.groupId})` === form.courseGroup || g.groupName === form.courseGroup || g.groupId === form.courseGroup
                    )
                    if (!matchedGroup) return null
                    return (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs md:col-span-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="font-semibold text-primary">Connected Group:</span>
                          <span><strong>Course:</strong> {matchedGroup.course}</span>
                          {matchedGroup.batch ? <span><strong>Batch:</strong> {matchedGroup.batch}</span> : null}
                          <span><strong>Group Fee:</strong> ₹{matchedGroup.feeAmount} ({matchedGroup.feeFrequency})</span>
                          <span><strong>Enrolled:</strong> {matchedGroup.studentIds.length} students</span>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setForm((f) => ({
                              ...f,
                              studentIds: Array.from(new Set([...f.studentIds, ...matchedGroup.studentIds])),
                            }))
                          }}
                          className="h-6 text-[11px]"
                        >
                          Select all {matchedGroup.studentIds.length} group students
                        </Button>
                      </div>
                    )
                  })()}
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
                    <FieldLabel htmlFor="status">Fee Status</FieldLabel>
                    <select
                      id="status"
                      className={selectClassName}
                      value={form.status === "Active" ? "Paid" : form.status}
                      onChange={set("status")}
                      required
                    >
                      <option value="Paid">Paid</option>
                      <option value="Unpaid">Unpaid</option>
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
                    <div className="flex flex-wrap items-center gap-2">
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
                        Select all ({availableStudents.length})
                      </Button>
                      {form.branch && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const b = form.branch.toLowerCase().trim()
                            const branchIds = availableStudents
                              .filter((s) => s.branch && s.branch.toLowerCase().trim() === b)
                              .map((s) => s.studentId)
                            setForm((f) => ({
                              ...f,
                              studentIds: Array.from(new Set([...f.studentIds, ...branchIds])),
                            }))
                          }}
                        >
                          Select all {form.branch} students
                        </Button>
                      )}
                      {form.courseGroup && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            const cg = form.courseGroup.toLowerCase()
                            const matchingIds = availableStudents
                              .filter((s) => (s.course && cg.includes(s.course.toLowerCase())) || (s.group && cg.includes(s.group.toLowerCase())))
                              .map((s) => s.studentId)
                            setForm((f) => ({
                              ...f,
                              studentIds: Array.from(new Set([...f.studentIds, ...matchingIds])),
                            }))
                          }}
                        >
                          Select matching students
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setForm((f) => ({ ...f, studentIds: [] }))}
                      >
                        Clear
                      </Button>
                    </div>
                    <div className="max-h-52 overflow-y-auto rounded-[10px] border border-input bg-card p-1.5 custom-scroll">
                      {availableStudents.length === 0 ? (
                        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                          No students found. Add students first on the Students page.
                        </p>
                      ) : (
                        availableStudents.map((s) => (
                          <label
                            key={s.studentId}
                            className="app-transition flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-1.5 text-sm hover:bg-muted"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                className="size-4 accent-primary"
                                checked={form.studentIds.includes(s.studentId)}
                                onChange={() => toggleStudent(s.studentId)}
                              />
                              <span className="font-medium text-foreground">{s.studentName}</span>
                              <span className="font-mono text-xs text-muted-foreground">{s.studentId}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                              {s.branch ? (
                                <span className="rounded border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                                  {s.branch}
                                </span>
                              ) : null}
                              {s.course && <span>{s.course}</span>}
                              {s.group ? (
                                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                                  {s.group}
                                </span>
                              ) : null}
                            </div>
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
                  <Button
                    type="submit"
                    disabled={branches.filter((b) => b.status === "Active").length === 0 || !form.branch.trim()}
                  >
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
                    <DetailItem label="Branch">{viewStructure.branch || "—"}</DetailItem>
                    <DetailItem label="Course / Group">{viewStructure.courseGroup || "—"}</DetailItem>
                    <DetailItem label="Fee Type">{viewStructure.feeType || "—"}</DetailItem>
                    <DetailItem label="Amount">{viewStructure.amount ? `₹ ${viewStructure.amount}` : "—"}</DetailItem>
                    <DetailItem label="Frequency">{viewStructure.frequency || "—"}</DetailItem>
                    <DetailItem label="Due Date">{viewStructure.dueDate || "—"}</DetailItem>
                    <DetailItem label="Late Fee">{viewStructure.lateFee ? `₹ ${viewStructure.lateFee}` : "—"}</DetailItem>
                    <DetailItem label="Payment Methods">
                      {viewStructure.paymentMethods.length === 0 ? "—" : viewStructure.paymentMethods.join(", ")}
                    </DetailItem>
                    <DetailItem label="Fee Status">
                      <StatusBadge value={getStructureStatus(viewStructure, receipts)} />
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

          <DeleteConfirmDialog
            open={confirmDeleteSelected}
            onOpenChange={setConfirmDeleteSelected}
            title={`Delete ${selectedIds.size} fee structure${selectedIds.size === 1 ? "" : "s"}?`}
            description={`The ${selectedIds.size} selected fee structure(s) will be permanently removed from the database. This action cannot be undone.`}
            onConfirm={onDeleteSelected}
          />

          <DeleteConfirmDialog
            open={confirmDeleteAll}
            onOpenChange={setConfirmDeleteAll}
            title="Delete ALL fee structures?"
            description="Every fee structure in this workspace will be permanently removed from the database. This action cannot be undone."
            onConfirm={onDeleteAll}
          />
          </div>
        }
      />

      <Stats01 stats={stats} />

      <div className="data-table-surface">
        <div className="data-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 px-3">
                  <Checkbox
                    checked={structures.length > 0 && selectedIds.size === structures.length}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        checked ? new Set(structures.map((s) => s.structureId)) : new Set()
                      )
                    }
                    aria-label="Select all fee structures"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Structure ID</TableHead>
                <TableHead>Structure Name</TableHead>
                <TableHead>Branch</TableHead>
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
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={ClipboardListIcon}
                      title="No fee structures yet"
                      hint="Click New Fee Structure above to define your first fee head."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                structures.map((s, i) => (
                  <TableRow
                    key={`${s.structureId}-${i}`}
                    data-state={selectedIds.has(s.structureId) ? "selected" : undefined}
                  >
                    <TableCell className="w-10 px-3">
                      <Checkbox
                        checked={selectedIds.has(s.structureId)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds)
                          if (checked) next.add(s.structureId)
                          else next.delete(s.structureId)
                          setSelectedIds(next)
                        }}
                        aria-label={`Select ${s.structureName}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.structureId}</TableCell>
                    <TableCell className="font-medium text-foreground">{s.structureName}</TableCell>
                    <TableCell>
                      {s.branch ? (
                        <span className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                          {s.branch}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{s.courseGroup}</TableCell>
                    <TableCell>{s.feeType}</TableCell>
                    <TableCell className="tabular-nums">₹ {s.amount}</TableCell>
                    <TableCell>
                      <StatusBadge value={getStructureStatus(s, receipts)} />
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
            <span>
              {structures.length} structure{structures.length === 1 ? "" : "s"}
              {selectedIds.size > 0 && ` · ${selectedIds.size} selected`}
            </span>
            <span className="hidden sm:block">IDs auto-generate as FEE-001, FEE-002…</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
