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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
import {
  loadReceipts,
  saveReceipts,
  type StoredReceipt,
} from "@/lib/receipts-store"
import { PlusIcon, ReceiptIcon } from "lucide-react"

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-2 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-muted-foreground/70 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const initialForm = {
  studentId: "",
  amount: "",
  method: "Cash",
  paymentDate: "",
  status: "Paid",
  notes: "",
}

function nextReceiptId(n: number) {
  return `RCP-${String(n).padStart(3, "0")}`
}

export default function ReceiptsPage() {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(initialForm)
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [nextId, setNextId] = useState(1)
  const [hydrated, setHydrated] = useState(false)
  const [availableStudents, setAvailableStudents] = useState<StoredStudent[]>(
    []
  )
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [viewReceipt, setViewReceipt] = useState<StoredReceipt | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)

  const reloadReceipts = useCallback(() => {
    if (isSyncing()) return
    loadReceipts().then((stored) => {
      if (isSyncing()) return
      setReceipts((prev) => (sameJson(prev, stored) ? prev : stored))
      if (stored.length > 0) {
        const max = stored.reduce((m, r) => {
          const n = parseInt(r.receiptId.replace(/\D/g, ""), 10)
          return Number.isNaN(n) ? m : Math.max(m, n)
        }, 0)
        setNextId((n) => Math.max(n, max + 1))
      }
      setHydrated(true)
    })
  }, [])

  useEffect(() => {
    reloadReceipts()
  }, [reloadReceipts])

  useLiveReload(reloadReceipts)

  useEffect(() => {
    if (hydrated) void saveReceipts(receipts)
  }, [receipts, hydrated])

  useEffect(() => {
    if (open) {
      loadStudents().then(setAvailableStudents)
      loadDropdowns().then(setDropdowns)
    }
  }, [open])

  function set(key: keyof typeof initialForm) {
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
    const student = availableStudents.find(
      (s) => s.studentId === form.studentId
    )
    if (editingIndex !== null) {
      const prev = receipts[editingIndex]
      const updated: StoredReceipt = {
        receiptId: prev?.receiptId ?? nextReceiptId(nextId),
        studentId: form.studentId,
        studentName: student?.studentName ?? prev?.studentName ?? form.studentId,
        amount: form.amount,
        method: form.method,
        paymentDate: form.paymentDate,
        status: form.status,
        notes: form.notes,
      }
      setReceipts((list) => list.map((r, i) => (i === editingIndex ? updated : r)))
      setEditingIndex(null)
    } else {
      const receipt: StoredReceipt = {
        receiptId: nextReceiptId(nextId),
        studentId: form.studentId,
        studentName: student?.studentName ?? form.studentId,
        amount: form.amount,
        method: form.method,
        paymentDate: form.paymentDate,
        status: form.status,
        notes: form.notes,
      }
      setReceipts((r) => [...r, receipt])
      setNextId((n) => n + 1)
    }
    setForm(initialForm)
    setOpen(false)
  }

  function openEdit(index: number) {
    const r = receipts[index]
    if (!r) return
    setForm({
      studentId: r.studentId,
      amount: r.amount,
      method: r.method,
      paymentDate: r.paymentDate,
      status: r.status,
      notes: r.notes,
    })
    setEditingIndex(index)
    setOpen(true)
  }

  function onDelete(index: number) {
    setReceipts((r) => r.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setEditingIndex(null)
    setOpen(false)
  }

  const collected = receipts.reduce((sum, r) => sum + (parseFloat(String(r.amount)) || 0), 0)
  const avgReceipt = receipts.length === 0 ? 0 : collected / receipts.length
  const outstanding = receipts.filter((r) => r.status !== "Paid")
  const methodCounts = new Map<string, number>()
  for (const r of receipts) methodCounts.set(r.method || "Other", (methodCounts.get(r.method || "Other") ?? 0) + 1)
  const topMethod = [...methodCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—"
  const stats = [
    {
      name: "Fees collected",
      value: `₹ ${collected.toLocaleString("en-IN")}`,
      ...momTrend(receipts.map((r) => ({ date: r.paymentDate, amount: parseFloat(String(r.amount)) || 0 }))),
    },
    {
      name: "Receipts issued",
      value: String(receipts.length),
      ...momTrend(receipts.map((r) => ({ date: r.paymentDate }))),
    },
    {
      name: "Avg. receipt",
      value: `₹ ${Math.round(avgReceipt).toLocaleString("en-IN")}`,
      change: `top: ${topMethod}`,
      changeType: "neutral" as const,
    },
    {
      name: "Outstanding",
      value: String(outstanding.length),
      ...momTrend(outstanding.map((r) => ({ date: r.paymentDate })), { invert: true }),
    },
  ]

  return (
    <DashboardShell trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Receipts" }]}>
      <PageHeader
        title="Receipts"
        description="Record fee payments. Every receipt is listed below with student and method."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {receipts.length} total
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
              New Receipt
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  {editingIndex !== null ? "Edit Receipt" : "New Receipt"}
                </DialogTitle>
                <DialogDescription>
                  {editingIndex !== null
                    ? "Update the payment details below."
                    : "Fill in payment details. Receipt ID is auto-generated."}
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={onSubmit} className="flex flex-col">
                <div className="grid gap-4 px-6 py-5 md:grid-cols-2">
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="studentId">Student</FieldLabel>
                    <select
                      id="studentId"
                      className={selectClassName}
                      value={form.studentId}
                      onChange={set("studentId")}
                      required
                    >
                      <option value="" disabled>
                        Select student
                      </option>
                      {availableStudents.map((s) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.studentName} ({s.studentId})
                        </option>
                      ))}
                    </select>
                    {availableStudents.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No students found. Add students first on the Students page.
                      </p>
                    )}
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
                    <FieldLabel htmlFor="method">Payment Method</FieldLabel>
                    <select
                      id="method"
                      className={selectClassName}
                      value={form.method}
                      onChange={set("method")}
                      required
                    >
                      {(dropdowns?.paymentMethod ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="paymentDate">Payment Date</FieldLabel>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={form.paymentDate}
                      onChange={set("paymentDate")}
                      required
                    />
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
                      {(dropdowns?.receiptStatus ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="notes">Notes</FieldLabel>
                    <textarea
                      id="notes"
                      className={textareaClassName}
                      placeholder="Optional payment notes"
                      value={form.notes}
                      onChange={set("notes")}
                      rows={3}
                    />
                  </Field>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={onCancel}>
                    Cancel
                  </Button>
                  <Button type="submit">
                    {editingIndex !== null ? "Save Changes" : "Save Receipt"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={viewReceipt !== null}
            onOpenChange={(v) => {
              if (!v) setViewReceipt(null)
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto p-0 sm:max-w-lg">
              <DialogHeader>
                <DialogTitle className="text-base font-semibold tracking-tight">
                  Receipt details
                </DialogTitle>
                <DialogDescription>
                  {viewReceipt?.receiptId} · {viewReceipt?.studentName}
                </DialogDescription>
              </DialogHeader>
              {viewReceipt && (
                <div className="px-6 py-5">
                  <DetailList>
                    <DetailItem label="Receipt ID">{viewReceipt.receiptId}</DetailItem>
                    <DetailItem label="Student">
                      {viewReceipt.studentName} ({viewReceipt.studentId})
                    </DetailItem>
                    <DetailItem label="Amount">₹ {viewReceipt.amount}</DetailItem>
                    <DetailItem label="Payment Method">{viewReceipt.method || "—"}</DetailItem>
                    <DetailItem label="Payment Date">{viewReceipt.paymentDate || "—"}</DetailItem>
                    <DetailItem label="Status">
                      <StatusBadge value={viewReceipt.status} />
                    </DetailItem>
                    <DetailItem label="Notes">{viewReceipt.notes || "—"}</DetailItem>
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
            title="Delete receipt?"
            description={`${receipts[deleteIndex ?? -1]?.receiptId ?? "This receipt"} (${receipts[deleteIndex ?? -1]?.studentName ?? ""}) will be permanently removed from the database. This action cannot be undone.`}
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
                <TableHead>Receipt ID</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={8} className="p-0">
                    <EmptyState
                      icon={ReceiptIcon}
                      title="No receipts yet"
                      hint="Click New Receipt above to record your first fee payment."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                receipts.map((r, i) => (
                  <TableRow key={`${r.receiptId}-${i}`}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{r.receiptId}</TableCell>
                    <TableCell className="font-medium text-foreground" title={r.studentId}>
                      {r.studentName} <span className="font-mono text-xs font-normal text-muted-foreground">({r.studentId})</span>
                    </TableCell>
                    <TableCell className="tabular-nums">₹ {r.amount}</TableCell>
                    <TableCell>{r.method}</TableCell>
                    <TableCell className="tabular-nums">{r.paymentDate}</TableCell>
                    <TableCell>
                      <StatusBadge value={r.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <RowActions
                        onView={() => setViewReceipt(r)}
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
        {receipts.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>{receipts.length} receipt{receipts.length === 1 ? "" : "s"}</span>
            <span className="hidden sm:block">IDs auto-generate as RCP-001, RCP-002…</span>
          </div>
        )}
      </div>
    </DashboardShell>
  )
}
