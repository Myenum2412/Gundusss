"use client"

import { useCallback, useEffect, useState } from "react"
import { loadStudents, saveStudents } from "@/lib/students-store"
import { loadGroups, saveGroups, type StoredGroup } from "@/lib/groups-store"
import {
  loadFeeStructures,
  saveFeeStructures,
  type StoredFeeStructure,
} from "@/lib/fee-structures-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
import { loadBranches, type StoredBranch } from "@/lib/branches-store"
import {
  loadReceipts,
  type StoredReceipt,
} from "@/lib/receipts-store"
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
import { Checkbox } from "@/components/ui/checkbox"
import { PlusIcon, Trash2Icon, UsersIcon } from "lucide-react"

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
  branch: "",
  structureName: "",
  joiningDate: "",
  status: "Active",
}

type Student = typeof initialForm & { studentId: string }

function nextStudentId(n: number) {
  return `STU-${String(n).padStart(3, "0")}`
}

function getStudentFeeStatus(
  student: Student,
  receiptsList: StoredReceipt[]
): "Paid" | "Unpaid" {
  const st = (student.status || "").toLowerCase().trim()
  if (st === "paid") return "Paid"
  if (st === "unpaid") return "Unpaid"

  const hasPaid = receiptsList.some((r) => {
    const isPaid = (r.status || "").toLowerCase() === "paid"
    if (!isPaid) return false
    if (r.studentId && r.studentId === student.studentId) return true
    if (
      r.studentName &&
      student.studentName &&
      r.studentName.trim().toLowerCase() === student.studentName.trim().toLowerCase()
    )
      return true
    return false
  })
  return hasPaid ? "Paid" : "Unpaid"
}

export default function StudentsPage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [students, setStudents] = useState<Student[]>([])
  const [nextId, setNextId] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [feeStructures, setFeeStructures] = useState<StoredFeeStructure[]>([])
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [branches, setBranches] = useState<StoredBranch[]>([])
  const [viewStudent, setViewStudent] = useState<Student | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [confirmDeleteSelected, setConfirmDeleteSelected] = useState(false)
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false)
  const [formError, setFormError] = useState("")

  const reloadDependencies = useCallback(() => {
    loadReceipts()
      .then(setReceipts)
      .catch((error) => console.error("Failed to load receipts", error))
    loadDropdowns()
      .then(setDropdowns)
      .catch((error) => console.error("Failed to load dropdown options", error))
    loadBranches()
      .then(setBranches)
      .catch((error) => console.error("Failed to load branches", error))
    loadGroups()
      .then(setGroups)
      .catch((error) => console.error("Failed to load student groups", error))
    loadFeeStructures()
      .then(setFeeStructures)
      .catch((error) => console.error("Failed to load fee structures", error))
  }, [])

  useEffect(() => {
    reloadDependencies()
  }, [reloadDependencies])

  useEffect(() => {
    if (open) {
      reloadDependencies()
    }
  }, [open, reloadDependencies])

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
    }).catch((error) => {
      console.error("Failed to load students", error)
    })
  }, [])

  useEffect(() => {
    reloadStudents()
  }, [reloadStudents])

  useLiveReload(reloadStudents)

  function set(key: keyof typeof initialForm) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
    ) => {
      setForm((f) => ({ ...f, [key]: e.target.value }))
    }
  }

  function handleGroupChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const matched = groups.find((g) => g.groupName === val || g.groupId === val)
    setForm((f) => ({
      ...f,
      group: val,
      course: matched?.course ? matched.course : f.course,
    }))
  }

  function handleStructureChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value
    const matched = feeStructures.find(
      (fs) => fs.structureName === val || fs.structureId === val
    )
    setForm((f) => ({
      ...f,
      structureName: val,
      branch: !f.branch && matched?.branch ? matched.branch : f.branch,
    }))
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmedBranch = (form.branch || "").trim()
    if (!trimmedBranch) {
      setFormError("Branch is required. A student cannot be created without a branch.")
      return
    }
    setFormError("")
    let assignedId = ""
    if (editingIndex !== null) {
      assignedId = students[editingIndex]?.studentId ?? nextStudentId(nextId)
      const updated: Student = { ...form, branch: trimmedBranch, studentId: assignedId }
      const nextList = students.map((s, i) => (i === editingIndex ? updated : s))
      setStudents(nextList)
      void saveStudents(nextList)
      setEditingIndex(null)
    } else {
      assignedId = nextStudentId(nextId)
      const student: Student = { ...form, branch: trimmedBranch, studentId: assignedId }
      const nextList = [...students, student]
      setStudents(nextList)
      void saveStudents(nextList)
      setNextId((n) => n + 1)
    }

    // Bidirectional sync: keep studentIds updated in groups-store
    if (form.group && assignedId) {
      loadGroups().then((currGroups) => {
        let changed = false
        const next = currGroups.map((g) => {
          const isTarget = g.groupName === form.group || g.groupId === form.group
          const hasId = g.studentIds.includes(assignedId)
          if (isTarget && !hasId) {
            changed = true
            return { ...g, studentIds: [...g.studentIds, assignedId] }
          }
          if (!isTarget && hasId && editingIndex !== null) {
            changed = true
            return { ...g, studentIds: g.studentIds.filter((id) => id !== assignedId) }
          }
          return g
        })
        if (changed) void saveGroups(next)
      }).catch(console.error)
    }

    // Bidirectional sync: keep studentIds updated in fee-structures-store
    if (assignedId) {
      loadFeeStructures().then((currStructures) => {
        let changed = false
        const next = currStructures.map((fs) => {
          const isTarget =
            form.structureName &&
            (fs.structureName === form.structureName || fs.structureId === form.structureName)
          const hasId = fs.studentIds && fs.studentIds.includes(assignedId)
          if (isTarget && !hasId) {
            changed = true
            return { ...fs, studentIds: [...(fs.studentIds || []), assignedId] }
          }
          if (!isTarget && hasId && editingIndex !== null) {
            changed = true
            return { ...fs, studentIds: (fs.studentIds || []).filter((id) => id !== assignedId) }
          }
          return fs
        })
        if (changed) void saveFeeStructures(next)
      }).catch(console.error)
    }

    setForm(initialForm)
    setOpen(false)
  }

  function openEdit(index: number) {
    const s = students[index]
    if (!s) return
    const { studentId, ...rest } = s
    void studentId
    setForm({
      ...initialForm,
      ...rest,
      structureName: rest.structureName || "",
    })
    setEditingIndex(index)
    setFormError("")
    setOpen(true)
  }

  function onDelete(index: number) {
    const s = students[index]
    if (s?.studentId) {
      loadGroups().then((currGroups) => {
        let changed = false
        const next = currGroups.map((g) => {
          if (g.studentIds.includes(s.studentId)) {
            changed = true
            return {
              ...g,
              studentIds: g.studentIds.filter((id) => id !== s.studentId),
            }
          }
          return g
        })
        if (changed) void saveGroups(next)
      }).catch(console.error)

      loadFeeStructures().then((currStructures) => {
        let changed = false
        const next = currStructures.map((fs) => {
          if (fs.studentIds && fs.studentIds.includes(s.studentId)) {
            changed = true
            return {
              ...fs,
              studentIds: fs.studentIds.filter((id) => id !== s.studentId),
            }
          }
          return fs
        })
        if (changed) void saveFeeStructures(next)
      }).catch(console.error)
    }
    const nextList = students.filter((_, i) => i !== index)
    setStudents(nextList)
    void saveStudents(nextList)
    if (s?.studentId && selectedIds.has(s.studentId)) {
      const nextSel = new Set(selectedIds)
      nextSel.delete(s.studentId)
      setSelectedIds(nextSel)
    }
  }

  function onDeleteSelected() {
    const nextList = students.filter((s) => !selectedIds.has(s.studentId))
    setStudents(nextList)
    void saveStudents(nextList)
    setSelectedIds(new Set())
  }

  function onDeleteAll() {
    setStudents([])
    void saveStudents([])
    setSelectedIds(new Set())
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  const nowKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  const paidStudents = students.filter((s) => getStudentFeeStatus(s, receipts) === "Paid")
  const unpaidStudents = students.filter((s) => getStudentFeeStatus(s, receipts) === "Unpaid")
  const newThisMonth = students.filter((s) => (s.joiningDate ?? "").slice(0, 7) === nowKey).length
  const stats = [
    {
      name: "Total students",
      value: String(students.length),
      change: `${paidStudents.length} paid · ${unpaidStudents.length} unpaid`,
      changeType: "neutral" as const,
    },
    {
      name: "Paid students",
      value: String(paidStudents.length),
      change: "fees cleared",
      changeType: "positive" as const,
    },
    {
      name: "Unpaid students",
      value: String(unpaidStudents.length),
      change: "pending payment",
      changeType: "neutral" as const,
    },
    {
      name: "Joined this month",
      value: String(newThisMonth),
      ...momTrend(students.map((s) => ({ date: s.joiningDate }))),
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
          <div className="flex flex-wrap items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setConfirmDeleteSelected(true)}
            >
              <Trash2Icon />
              Delete Selected ({selectedIds.size})
            </Button>
          )}
          {students.length > 0 && (
            <Button
              variant="outline"
              className="text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmDeleteAll(true)}
            >
              <Trash2Icon />
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
                  {formError && (
                    <div className="rounded-[10px] border border-destructive/20 bg-destructive/5 px-3.5 py-2.5 text-xs font-medium text-destructive">
                      {formError}
                    </div>
                  )}
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
                          onChange={handleGroupChange}
                          required
                        >
                          <option value="" disabled>
                            Select
                          </option>
                          {groups.length > 0 && (
                            <optgroup label="Student Groups">
                              {groups.map((g) => (
                                <option key={g.groupId} value={g.groupName}>
                                  {g.groupName} · {g.course} (₹{g.feeAmount})
                                </option>
                              ))}
                            </optgroup>
                          )}
                          <optgroup label="General / Other">
                            {(dropdowns?.classGroup ?? []).map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </optgroup>
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
                      {(() => {
                        const matched = groups.find(
                          (g) => g.groupName === form.group || g.groupId === form.group
                        )
                        if (!matched) return null
                        return (
                          <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs md:col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                            <span className="font-semibold text-primary">Connected Group Details:</span>
                            <span><strong>Course:</strong> {matched.course}</span>
                            {matched.batch ? <span><strong>Batch:</strong> {matched.batch}</span> : null}
                            <span><strong>Fee:</strong> ₹{matched.feeAmount} ({matched.feeFrequency})</span>
                            <span><strong>Enrolled:</strong> {matched.studentIds.length} students</span>
                          </div>
                        )
                      })()}
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
                                {b.code ? ` (${b.code})` : ""}
                              </option>
                            ))}
                        </select>
                        {branches.filter((b) => b.status === "Active").length === 0 ? (
                          <p className="text-xs text-destructive">
                            No active branches found. You must create an active branch on the Branches page before adding students.
                          </p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">
                            Every student must be assigned to an active branch.
                          </p>
                        )}
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="structureName">Structure Name</FieldLabel>
                        <select
                          id="structureName"
                          className={selectClassName}
                          value={form.structureName}
                          onChange={handleStructureChange}
                        >
                          <option value="">Select Structure Name (Optional)</option>
                          {feeStructures
                            .filter((fs) => !form.branch || !fs.branch || fs.branch === form.branch)
                            .map((fs) => (
                              <option key={fs.structureId} value={fs.structureName}>
                                {fs.structureName} · ₹{fs.amount} ({fs.frequency || "Monthly"}{fs.branch ? ` · ${fs.branch}` : ""})
                              </option>
                            ))}
                          {form.branch &&
                            feeStructures.filter((fs) => fs.branch && fs.branch !== form.branch).length > 0 && (
                              <optgroup label="Other Branches">
                                {feeStructures
                                  .filter((fs) => fs.branch && fs.branch !== form.branch)
                                  .map((fs) => (
                                    <option key={fs.structureId} value={fs.structureName}>
                                      {fs.structureName} · ₹{fs.amount} ({fs.branch})
                                    </option>
                                  ))}
                              </optgroup>
                            )}
                        </select>
                        <p className="text-[11px] text-muted-foreground">
                          Fee schedule and payment amount will be based on this Structure Name.
                        </p>
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

                      {(() => {
                        const matched = feeStructures.find(
                          (fs) => fs.structureName === form.structureName || fs.structureId === form.structureName
                        )
                        if (!matched) return null
                        return (
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs md:col-span-2 flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                                Fees based on Structure Name: &quot;{matched.structureName}&quot;
                              </span>
                              <span className="font-bold text-foreground text-sm">₹{matched.amount}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
                              <span><strong>Amount:</strong> ₹{matched.amount}</span>
                              <span><strong>Frequency:</strong> {matched.frequency || "Monthly"}</span>
                              <span><strong>Fee Type:</strong> {matched.feeType || "Tuition Fee"}</span>
                              {matched.dueDate ? <span><strong>Due Day:</strong> Day {matched.dueDate} of cycle</span> : null}
                              {matched.lateFee ? <span><strong>Late Fee:</strong> ₹{matched.lateFee}</span> : null}
                              {matched.branch ? <span><strong>Branch:</strong> {matched.branch}</span> : null}
                              {matched.courseGroup ? <span><strong>Course/Group:</strong> {matched.courseGroup}</span> : null}
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={branches.filter((b) => b.status === "Active").length === 0 || !form.branch.trim()}
                  >
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
                    <DetailItem label="Branch">{viewStudent.branch || "—"}</DetailItem>
                    <DetailItem label="Structure Name">{viewStudent.structureName || "—"}</DetailItem>
                    {(() => {
                      const matchedFs = feeStructures.find(
                        (fs) => fs.structureName === viewStudent.structureName || fs.structureId === viewStudent.structureName
                      )
                      if (!matchedFs) return null
                      return (
                        <DetailItem label="Structure Fees">
                          ₹{matchedFs.amount} ({matchedFs.frequency || "Monthly"} · {matchedFs.feeType || "Tuition"})
                        </DetailItem>
                      )
                    })()}
                    <DetailItem label="Joining Date">{viewStudent.joiningDate || "—"}</DetailItem>
                    <DetailItem label="Fee Status">
                      <StatusBadge value={getStudentFeeStatus(viewStudent, receipts)} />
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

          <DeleteConfirmDialog
            open={confirmDeleteSelected}
            onOpenChange={setConfirmDeleteSelected}
            title={`Delete ${selectedIds.size} student${selectedIds.size === 1 ? "" : "s"}?`}
            description={`The ${selectedIds.size} selected student(s) will be permanently removed from the database. This action cannot be undone.`}
            onConfirm={onDeleteSelected}
          />

          <DeleteConfirmDialog
            open={confirmDeleteAll}
            onOpenChange={setConfirmDeleteAll}
            title="Delete ALL students?"
            description="Every student in this workspace will be permanently removed from the database. This action cannot be undone."
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
                    checked={students.length > 0 && selectedIds.size === students.length}
                    onCheckedChange={(checked) =>
                      setSelectedIds(
                        checked ? new Set(students.map((s) => s.studentId)) : new Set()
                      )
                    }
                    aria-label="Select all students"
                  />
                </TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead>Structure Name</TableHead>
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
                  <TableCell colSpan={12} className="p-0">
                    <EmptyState
                      icon={UsersIcon}
                      title="No students yet"
                      hint="Click Add Student above to enrol your first student. They will appear here across the full width of this table."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                students.map((s, i) => (
                  <TableRow
                    key={`${s.studentId}-${i}`}
                    data-state={selectedIds.has(s.studentId) ? "selected" : undefined}
                  >
                    <TableCell className="w-10 px-3">
                      <Checkbox
                        checked={selectedIds.has(s.studentId)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds)
                          if (checked) next.add(s.studentId)
                          else next.delete(s.studentId)
                          setSelectedIds(next)
                        }}
                        aria-label={`Select ${s.studentName}`}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-medium text-foreground">{s.studentName}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{s.studentId}</TableCell>
                    <TableCell>
                      {s.branch ? (
                        <span className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-0.5 text-xs font-medium">
                          {s.branch}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-destructive">Missing Branch</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {s.structureName ? (
                        <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                          {s.structureName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{s.group}</TableCell>
                    <TableCell>{s.course}</TableCell>
                    <TableCell className="tabular-nums">{s.phone}</TableCell>
                    <TableCell className="tabular-nums">{s.joiningDate}</TableCell>
                    <TableCell>
                      <StatusBadge value={getStudentFeeStatus(s, receipts)} />
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
            <span>
              {selectedIds.size > 0 ? `${selectedIds.size} of ` : ""}
              {students.length} student{students.length === 1 ? "" : "s"}
              {selectedIds.size > 0 ? " selected" : ""}
            </span>
            <span className="hidden sm:block">IDs auto-generate as STU-001, STU-002…</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
