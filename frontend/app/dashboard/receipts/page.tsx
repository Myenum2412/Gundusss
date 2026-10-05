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
import {
  loadReceipts,
  saveReceipts,
  type StoredReceipt,
} from "@/lib/receipts-store"

const selectClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

const textareaClassName =
  "min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

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
    if (open) setAvailableStudents(loadStudents())
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
                  <BreadcrumbPage>Receipts</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Receipts</h1>
              <p className="text-sm text-muted-foreground">
                Record fee payments. Click New Receipt to open the form popup.
              </p>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger render={<Button />}>New Receipt</DialogTrigger>
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
                        <p className="text-xs text-muted-foreground">
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
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
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
                        <option value="Paid">Paid</option>
                        <option value="Pending">Pending</option>
                        <option value="Cancelled">Cancelled</option>
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
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card text-card-foreground">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sno</TableHead>
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
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="py-10 text-center text-muted-foreground"
                    >
                      No receipts yet — click New Receipt.
                    </TableCell>
                  </TableRow>
                ) : (
                  receipts.map((r, i) => (
                    <TableRow key={`${r.receiptId}-${i}`}>
                      <TableCell>{i + 1}</TableCell>
                      <TableCell>{r.receiptId}</TableCell>
                      <TableCell className="font-medium" title={r.studentId}>
                        {r.studentName} ({r.studentId})
                      </TableCell>
                      <TableCell>₹ {r.amount}</TableCell>
                      <TableCell>{r.method}</TableCell>
                      <TableCell>{r.paymentDate}</TableCell>
                      <TableCell>{r.status}</TableCell>
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
