"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { loadBranches, saveBranches, type StoredBranch } from "@/lib/branches-store"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
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
  Building2Icon,
  CheckCircle2Icon,
  GitBranchIcon,
  LandmarkIcon,
  MailIcon,
  MapPinIcon,
  PhoneIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
  UsersIcon,
} from "lucide-react"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const initialForm = {
  branchName: "",
  code: "",
  managerName: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  capacity: "",
  isHeadBranch: false,
  status: "Active",
}

type Branch = typeof initialForm & { branchId: string }

function nextBranchId(n: number) {
  return `BR-${String(n).padStart(3, "0")}`
}

export default function BranchesPage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [branches, setBranches] = useState<Branch[]>([])
  const [students, setStudents] = useState<StoredStudent[]>([])
  const [nextId, setNextId] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [viewBranch, setViewBranch] = useState<Branch | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  const reloadBranches = useCallback(() => {
    if (isSyncing()) return
    loadBranches()
      .then((stored) => {
        if (isSyncing()) return
        setBranches((prev) =>
          sameJson(prev, stored) ? prev : (stored as Branch[])
        )
        if (stored.length > 0) {
          const max = stored.reduce((m, b) => {
            const n = parseInt(b.branchId.replace(/\D/g, ""), 10)
            return Number.isNaN(n) ? m : Math.max(m, n)
          }, 0)
          setNextId((n) => Math.max(n, max + 1))
        }
        setHydrated(true)
      })
      .catch((error) => {
        console.error("Failed to load branches", error)
      })
    loadStudents()
      .then(setStudents)
      .catch((err) => console.error("Failed to load students in branches", err))
  }, [])

  useEffect(() => {
    reloadBranches()
  }, [reloadBranches])

  useLiveReload(reloadBranches)

  useEffect(() => {
    if (hydrated) void saveBranches(branches)
  }, [branches, hydrated])

  function set(key: keyof typeof initialForm) {
    return (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) => {
      const value =
        e.target.type === "checkbox"
          ? (e.target as HTMLInputElement).checked
          : e.target.value
      setForm((f) => ({ ...f, [key]: value }))
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (editingIndex !== null) {
      const id = branches[editingIndex]?.branchId ?? nextBranchId(nextId)
      const updated: Branch = { ...form, branchId: id }
      // If setting this branch as head, ensure others are false
      setBranches((prev) =>
        prev.map((b, i) => {
          if (i === editingIndex) return updated
          if (form.isHeadBranch) return { ...b, isHeadBranch: false }
          return b
        })
      )
      setEditingIndex(null)
    } else {
      const branch: Branch = { ...form, branchId: nextBranchId(nextId) }
      setBranches((prev) => {
        const nextList = form.isHeadBranch
          ? prev.map((b) => ({ ...b, isHeadBranch: false }))
          : [...prev]
        return [...nextList, branch]
      })
      setNextId((n) => n + 1)
    }
    setForm(initialForm)
    setOpen(false)
  }

  function openEdit(index: number) {
    const b = branches[index]
    if (!b) return
    const { branchId, ...rest } = b
    void branchId
    setForm(rest)
    setEditingIndex(index)
    setOpen(true)
  }

  function onDelete(index: number) {
    setBranches((b) => b.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  // Filtered list
  const filtered = useMemo(() => {
    return branches.filter((b) => {
      if (statusFilter !== "ALL" && b.status !== statusFilter) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        b.branchName.toLowerCase().includes(q) ||
        b.code.toLowerCase().includes(q) ||
        b.city.toLowerCase().includes(q) ||
        b.managerName.toLowerCase().includes(q) ||
        b.branchId.toLowerCase().includes(q)
      )
    })
  }, [branches, search, statusFilter])

  const activeCount = branches.filter((b) => b.status === "Active").length
  const headBranch = branches.find((b) => b.isHeadBranch)
  const totalCapacity = branches.reduce((sum, b) => {
    const n = parseInt(b.capacity.replace(/\D/g, ""), 10)
    return sum + (Number.isNaN(n) ? 0 : n)
  }, 0)

  const stats = [
    {
      name: "Total Branches",
      value: String(branches.length),
      change: "workspace centres",
      changeType: "neutral" as const,
    },
    {
      name: "Active Branches",
      value: String(activeCount),
      change: `${branches.length - activeCount} inactive`,
      changeType: "positive" as const,
    },
    {
      name: "Head Campus",
      value: headBranch ? headBranch.branchName : "Not specified",
      change: headBranch?.code ? `Code: ${headBranch.code}` : "Primary branch",
      changeType: "neutral" as const,
    },
    {
      name: "Total Capacity",
      value: totalCapacity > 0 ? `${totalCapacity.toLocaleString()} seats` : "—",
      change: "enrolment capacity",
      changeType: "positive" as const,
    },
  ]

  return (
    <DashboardShell
      trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Branches" }]}
    >
      <PageHeader
        title="Branches"
        description="Manage institution branches, centers, campus locations, and regional offices in this workspace."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {branches.length} branch{branches.length === 1 ? "" : "es"}
            </span>
            <LiveBadge />
          </span>
        }
        actions={
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
              New Branch
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {editingIndex !== null ? "Edit Branch" : "New Branch"}
                </DialogTitle>
                <DialogDescription>
                  {editingIndex !== null
                    ? "Update branch location, manager, and contact information."
                    : "Add a campus or learning center location to your workspace."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col">
                <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="branchName">
                      Branch Name <span className="text-destructive">*</span>
                    </FieldLabel>
                    <Input
                      id="branchName"
                      placeholder="e.g. Main Campus - Downtown"
                      value={form.branchName}
                      onChange={set("branchName")}
                      required
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="code">Branch Code / Short Tag</FieldLabel>
                    <Input
                      id="code"
                      placeholder="e.g. MC-01, BLR-NORTH"
                      value={form.code}
                      onChange={set("code")}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="status">Operating Status</FieldLabel>
                    <select
                      id="status"
                      className={selectClassName}
                      value={form.status}
                      onChange={set("status")}
                    >
                      <option value="Active">Active</option>
                      <option value="Inactive">Inactive</option>
                    </select>
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="managerName">Branch Head / Manager</FieldLabel>
                    <Input
                      id="managerName"
                      placeholder="e.g. Dr. Ramesh Kumar"
                      value={form.managerName}
                      onChange={set("managerName")}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="capacity">Student Capacity</FieldLabel>
                    <Input
                      id="capacity"
                      placeholder="e.g. 500"
                      value={form.capacity}
                      onChange={set("capacity")}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="phone">Contact Phone</FieldLabel>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="e.g. +91 98765 43210"
                      value={form.phone}
                      onChange={set("phone")}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="email">Branch Email</FieldLabel>
                    <Input
                      id="email"
                      type="email"
                      placeholder="e.g. branch@myenum.in"
                      value={form.email}
                      onChange={set("email")}
                    />
                  </Field>

                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="address">Street Address</FieldLabel>
                    <textarea
                      id="address"
                      className={textareaClassName}
                      placeholder="Enter physical campus address"
                      value={form.address}
                      onChange={set("address")}
                      rows={2}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="city">City</FieldLabel>
                    <Input
                      id="city"
                      placeholder="e.g. Bangalore"
                      value={form.city}
                      onChange={set("city")}
                    />
                  </Field>

                  <Field>
                    <FieldLabel htmlFor="state">State / Region</FieldLabel>
                    <Input
                      id="state"
                      placeholder="e.g. Karnataka"
                      value={form.state}
                      onChange={set("state")}
                    />
                  </Field>

                  <Field className="md:col-span-2">
                    <label className="flex items-center gap-2.5 cursor-pointer rounded-xl border p-3 hover:bg-muted/40 transition">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary rounded"
                        checked={form.isHeadBranch}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, isHeadBranch: e.target.checked }))
                        }
                      />
                      <div>
                        <span className="block text-sm font-medium text-foreground">
                          Mark as Primary / Head Office Branch
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          This branch will be featured as the primary center for your institution.
                        </span>
                      </div>
                    </label>
                  </Field>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingIndex !== null ? "Save Changes" : "Create Branch"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Stats01 stats={stats} />

      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search branches, city, manager..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            className={selectClassName}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="ALL">All Statuses</option>
            <option value="Active">Active only</option>
            <option value="Inactive">Inactive only</option>
          </select>
        </div>
      </div>

      {branches.length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            icon={GitBranchIcon}
            title="No branches created"
            hint="Add physical campuses, coaching centers, or regional offices to organize your workspace."
          />
          <div className="flex justify-center -mt-8 mb-6">
            <Button onClick={() => setOpen(true)}>
              <PlusIcon />
              Add First Branch
            </Button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center text-sm text-muted-foreground">
          No branches matched your search filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch Details</TableHead>
                <TableHead>Branch ID / Code</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Contact Person</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((b) => {
                const originalIndex = branches.findIndex(
                  (x) => x.branchId === b.branchId
                )
                return (
                  <TableRow key={b.branchId}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          {b.isHeadBranch ? (
                            <LandmarkIcon className="size-4" />
                          ) : (
                            <Building2Icon className="size-4" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <span>{b.branchName}</span>
                            {b.isHeadBranch ? (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                                <SparklesIcon className="size-2.5" />
                                Head Office
                              </span>
                            ) : null}
                          </div>
                          {b.email ? (
                            <span className="text-xs text-muted-foreground">
                              {b.email}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="font-mono text-xs font-semibold text-foreground">
                        {b.branchId}
                      </span>
                      {b.code ? (
                        <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {b.code}
                        </span>
                      ) : null}
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        {b.city ? (
                          <span className="font-medium text-foreground">
                            {b.city}
                            {b.state ? `, ${b.state}` : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {b.address ? (
                          <p className="max-w-[200px] truncate text-xs text-muted-foreground">
                            {b.address}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium text-foreground">
                          {b.managerName || "—"}
                        </span>
                        {b.phone ? (
                          <p className="text-xs text-muted-foreground">
                            {b.phone}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell>
                      <div className="text-sm">
                        <span className="font-medium text-foreground">
                          {students.filter((s) => s.branch === b.branchName).length} enrolled
                        </span>
                        {b.capacity ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            / {b.capacity} cap
                          </span>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell>
                      <StatusBadge value={b.status} />
                    </TableCell>

                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewBranch(b)}
                        onEdit={() => openEdit(originalIndex)}
                        onDelete={() => setDeleteIndex(originalIndex)}
                      />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* View Branch Details Modal */}
      <Dialog open={!!viewBranch} onOpenChange={() => setViewBranch(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle>{viewBranch?.branchName}</DialogTitle>
              {viewBranch?.isHeadBranch ? (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                  Head Office
                </span>
              ) : null}
            </div>
            <DialogDescription>
              Branch ID: <span className="font-mono">{viewBranch?.branchId}</span>
              {viewBranch?.code ? ` · Code: ${viewBranch.code}` : ""}
            </DialogDescription>
          </DialogHeader>

          {viewBranch ? (
            <DetailList>
              <DetailItem label="Status">
                <StatusBadge value={viewBranch.status} />
              </DetailItem>
              <DetailItem label="Branch Head / Manager">
                {viewBranch.managerName || "—"}
              </DetailItem>
              <DetailItem label="Contact Phone">
                {viewBranch.phone || "—"}
              </DetailItem>
              <DetailItem label="Branch Email">
                {viewBranch.email || "—"}
              </DetailItem>
              <DetailItem label="Capacity & Enrollment">
                {students.filter((s) => s.branch === viewBranch.branchName).length} students enrolled
                {viewBranch.capacity ? ` (Capacity: ${viewBranch.capacity})` : ""}
              </DetailItem>
              <DetailItem label="Enrolled Students">
                {(() => {
                  const enrolled = students.filter((s) => s.branch === viewBranch.branchName)
                  if (enrolled.length === 0) return "No students assigned to this branch"
                  return `${enrolled.length} students (${enrolled.slice(0, 3).map((s) => s.studentName).join(", ")}${enrolled.length > 3 ? `, +${enrolled.length - 3} more` : ""})`
                })()}
              </DetailItem>
              <DetailItem label="City & State">
                {viewBranch.city} {viewBranch.state ? `, ${viewBranch.state}` : ""}
              </DetailItem>
              <DetailItem label="Full Address">
                {viewBranch.address || "—"}
              </DetailItem>
              <DetailItem label="Pincode">
                {viewBranch.pincode || "—"}
              </DetailItem>
            </DetailList>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setViewBranch(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        open={deleteIndex !== null}
        onOpenChange={(v) => !v && setDeleteIndex(null)}
        title="Delete branch?"
        description={
          deleteIndex !== null
            ? `Are you sure you want to delete "${branches[deleteIndex]?.branchName}"? This action cannot be undone.`
            : ""
        }
        onConfirm={() => {
          if (deleteIndex !== null) {
            onDelete(deleteIndex)
            setDeleteIndex(null)
          }
        }}
      />
    </DashboardShell>
  )
}
