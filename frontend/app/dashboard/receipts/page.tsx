"use client"

import { useEffect, useState } from "react"
import { PlusIcon, ReceiptIcon, Trash2Icon } from "lucide-react"
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
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
import {
  loadReceipts,
  saveReceipts,
  type StoredReceipt,
} from "@/lib/receipts-store"

const selectClassName =
  "h-10 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2 text-sm shadow-xs transition-all duration-200 outline-none hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-xl border border-input bg-card px-3 py-2.5 text-sm shadow-xs transition-all duration-200 outline-none placeholder:text-muted-foreground hover:border-ring/40 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 dark:bg-input/30"

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

  useEffect(() => {
    const stored = loadReceipts()
    if (stored.length > 0) {
      setReceipts(stored)
      const max = stored.reduce((m, r) => {
        const n = parseInt(r.receiptId.replace(/\D/g, ""), 10)
        return Number.isNaN(n) ? m : Math.max(m, n)
      }, 0)
      setNextId(max + 1)
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) saveReceipts(receipts)
  }, [receipts, hydrated])

  useEffect(() => {
    if (open) {
      setAvailableStudents(loadStudents())
      setDropdowns(loadDropdowns())
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
    // TODO: POST to backend when receipts API exists.
    const student = availableStudents.find(
      (s) => s.studentId === form.studentId
    )
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
    setForm(initialForm)
    setOpen(false)
  }

  function onDelete(index: number) {
    setReceipts((r) => r.filter((_, i) => i !== index))
  }

  function onCancel() {
    setForm(initialForm)
    setOpen(false)
  }

  return (
    <DashboardShell
      crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Receipts" }]}
      title="Receipts"
      description={`${receipts.length} payments recorded · receipt IDs auto-generate in RCP sequence with student-linked details.`}
      action={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <PlusIcon data-icon="inline-start" /> New Receipt
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New Receipt</DialogTitle>
              <DialogDescription>
                Fill in payment details. Receipt ID is auto-generated.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={onSubmit} className="flex flex-col gap-6">
              <div className="grid gap-4 md:grid-cols-2">
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
                    <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                      No students found. Add students first on the Students
                      page.
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
                  <FieldLabel htmlFor="paymentDate">
                    Payment Date
                  </FieldLabel>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={onCancel}
                >
                  Cancel
                </Button>
                <Button type="submit">Save Receipt</Button>
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
                    icon={<ReceiptIcon />}
                    title="No receipts yet"
                    description="Record fee payments with student, method, and date — IDs generate automatically."
                    action={
                      <Button size="sm" onClick={() => setOpen(true)}>
                        <PlusIcon data-icon="inline-start" /> New Receipt
                      </Button>
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              receipts.map((r, i) => (
                <TableRow key={`${r.receiptId}-${i}`}>
                  <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs">{r.receiptId}</span>
                  </TableCell>
                  <TableCell className="font-medium" title={r.studentId}>
                    {r.studentName}{" "}
                    <span className="font-normal text-muted-foreground">({r.studentId})</span>
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">₹ {r.amount}</TableCell>
                  <TableCell>{r.method}</TableCell>
                  <TableCell className="tabular-nums">{r.paymentDate}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
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
