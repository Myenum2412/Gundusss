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
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import {
  loadFeeStructures,
  type StoredFeeStructure,
} from "@/lib/fee-structures-store"
import { resolveStudentFee } from "@/lib/fee-lookup"
import {
  loadDropdowns,
  type DropdownMap,
} from "@/lib/dropdown-store"
import {
  loadReceipts,
  saveReceipts,
  downloadReceiptPdf,
  sendReceiptPdfWhatsApp,
  type StoredReceipt,
} from "@/lib/receipts-store"
import {
  CheckCircle2Icon,
  FileDownIcon,
  Loader2Icon,
  MessageSquareIcon,
  PlusIcon,
  ReceiptIcon,
  XIcon,
} from "lucide-react"

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
  const [feeStructures, setFeeStructures] = useState<StoredFeeStructure[]>([])
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [dropdowns, setDropdowns] = useState<DropdownMap | null>(null)
  const [viewReceipt, setViewReceipt] = useState<StoredReceipt | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null)
  const [downloadingPdf, setDownloadingPdf] = useState<string | null>(null)
  const [sendingWaPdf, setSendingWaPdf] = useState<string | null>(null)
  const [autoSendWa, setAutoSendWa] = useState(true)
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null)

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
    }).catch((error) => {
      console.error("Failed to load receipts", error)
    })
  }, [])

  useEffect(() => {
    reloadReceipts()
  }, [reloadReceipts])

  useLiveReload(reloadReceipts)

  useEffect(() => {
    if (hydrated) void saveReceipts(receipts)
  }, [receipts, hydrated])

  const reloadDependencies = useCallback(() => {
    loadStudents()
      .then(setAvailableStudents)
      .catch((error) => console.error("Failed to load students", error))
    loadGroups()
      .then(setGroups)
      .catch((error) => console.error("Failed to load student groups", error))
    loadFeeStructures()
      .then(setFeeStructures)
      .catch((error) => console.error("Failed to load fee structures", error))
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

  function handleStudentChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const sId = e.target.value
    const student = availableStudents.find((s) => s.studentId === sId)
    if (!student) {
      setForm((f) => ({ ...f, studentId: sId }))
      return
    }
    const fee = resolveStudentFee(student, feeStructures, groups)
    const today = new Date().toISOString().split("T")[0]
    setForm((f) => ({
      ...f,
      studentId: sId,
      amount: f.amount && editingIndex !== null ? f.amount : fee.amount,
      paymentDate: f.paymentDate || today,
      notes:
        f.notes && editingIndex !== null
          ? f.notes
          : `Fee payment for ${student.course || "Course"} (${student.group || "Regular"})`,
    }))
  }

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
    // Persisted to PostgreSQL via the save effect.
    const student = availableStudents.find(
      (s) => s.studentId === form.studentId
    )
    const targetReceiptId =
      editingIndex !== null
        ? receipts[editingIndex]?.receiptId ?? nextReceiptId(nextId)
        : nextReceiptId(nextId)

    if (editingIndex !== null) {
      const prev = receipts[editingIndex]
      const updated: StoredReceipt = {
        receiptId: targetReceiptId,
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
        receiptId: targetReceiptId,
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

    if (autoSendWa && form.status === "Paid" && student?.phone) {
      const phoneToSend = student.phone
      const sName = student.studentName
      setTimeout(async () => {
        try {
          await sendReceiptPdfWhatsApp(targetReceiptId, phoneToSend)
          setNotice({
            tone: "success",
            text: `Receipt #${targetReceiptId} saved and official PDF sent to ${sName}'s WhatsApp (${phoneToSend})!`,
          })
        } catch (err: any) {
          console.warn("Could not auto-send WhatsApp receipt PDF", err)
        }
      }, 700)
    }

    setForm(initialForm)
    setOpen(false)
  }

  async function handleDownloadPdf(receiptId: string) {
    setDownloadingPdf(receiptId)
    try {
      await downloadReceiptPdf(receiptId)
    } catch (err: any) {
      alert(err?.message || "Could not download receipt PDF")
    } finally {
      setDownloadingPdf(null)
    }
  }

  async function handleSendWaPdf(receipt: StoredReceipt) {
    setSendingWaPdf(receipt.receiptId)
    const student = availableStudents.find((s) => s.studentId === receipt.studentId)
    try {
      const res = await sendReceiptPdfWhatsApp(receipt.receiptId, student?.phone)
      setNotice({
        tone: "success",
        text: `Receipt #${receipt.receiptId} PDF successfully sent to WhatsApp (+${res.sentTo})!`,
      })
    } catch (err: any) {
      setNotice({
        tone: "error",
        text: err?.message || "Failed to send receipt PDF via WhatsApp",
      })
    } finally {
      setSendingWaPdf(null)
    }
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
        description="Record fee payments, download official PDF receipts, and auto-send receipts to students via WhatsApp."
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
                      onChange={handleStudentChange}
                      required
                    >
                      <option value="" disabled>
                        Select student
                      </option>
                      {availableStudents.map((s) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.studentName} ({s.studentId}){s.group ? ` · ${s.group}` : ""}{s.course ? ` · ${s.course}` : ""}
                        </option>
                      ))}
                    </select>
                    {availableStudents.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No students found. Add students first on the Students page.
                      </p>
                    )}
                  </Field>

                  {/* Connected Student & Fee Details Preview */}
                  {(() => {
                    const student = availableStudents.find((s) => s.studentId === form.studentId)
                    if (!student) return null
                    const fee = resolveStudentFee(student, feeStructures, groups)
                    return (
                      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs md:col-span-2">
                        <div className="flex items-center justify-between font-semibold text-primary">
                          <span>Connected Student & Fee Overview</span>
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-mono">
                            {fee.source}
                          </span>
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2 text-muted-foreground sm:grid-cols-4">
                          <div><strong className="text-foreground">Name:</strong> {student.studentName}</div>
                          <div><strong className="text-foreground">ID:</strong> {student.studentId}</div>
                          <div><strong className="text-foreground">Course:</strong> {student.course || "—"}</div>
                          <div><strong className="text-foreground">Group:</strong> {student.group || "—"}</div>
                          <div><strong className="text-foreground">Phone:</strong> {student.phone || "—"}</div>
                          <div><strong className="text-foreground">Branch:</strong> {student.branch || "—"}</div>
                          <div className="col-span-2">
                            <strong className="text-foreground">Standard Fee:</strong> ₹{fee.amount} ({fee.frequency || "Monthly"})
                          </div>
                        </div>
                      </div>
                    )
                  })()}

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

                  <Field className="md:col-span-2">
                    <label className="flex items-center gap-2.5 cursor-pointer rounded-xl border bg-muted/20 p-3 text-xs font-medium text-foreground hover:bg-muted/30 transition-colors">
                      <input
                        type="checkbox"
                        checked={autoSendWa}
                        onChange={(e) => setAutoSendWa(e.target.checked)}
                        className="size-4 accent-primary rounded cursor-pointer"
                      />
                      <span>Auto-send official PDF receipt to student via WhatsApp when saved as Paid</span>
                    </label>
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

                  <div className="mt-6 flex flex-wrap items-center gap-2 border-t pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadPdf(viewReceipt.receiptId)}
                      disabled={downloadingPdf === viewReceipt.receiptId}
                      className="gap-1.5"
                    >
                      {downloadingPdf === viewReceipt.receiptId ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <FileDownIcon className="size-3.5" />
                      )}
                      Download PDF
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSendWaPdf(viewReceipt)}
                      disabled={sendingWaPdf === viewReceipt.receiptId}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      {sendingWaPdf === viewReceipt.receiptId ? (
                        <Loader2Icon className="size-3.5 animate-spin" />
                      ) : (
                        <MessageSquareIcon className="size-3.5" />
                      )}
                      Send PDF via WhatsApp
                    </Button>
                  </div>
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

      {notice && (
        <div
          className={`mb-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            notice.tone === "success"
              ? "border-emerald-600/20 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notice.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="rounded p-1 opacity-70 hover:opacity-100 cursor-pointer"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      )}

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
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Download PDF Receipt"
                          className="size-8 text-primary hover:bg-primary/10 cursor-pointer"
                          onClick={() => handleDownloadPdf(r.receiptId)}
                          disabled={downloadingPdf === r.receiptId}
                        >
                          {downloadingPdf === r.receiptId ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <FileDownIcon className="size-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          title="Send PDF to Student WhatsApp"
                          className="size-8 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 cursor-pointer"
                          onClick={() => handleSendWaPdf(r)}
                          disabled={sendingWaPdf === r.receiptId}
                        >
                          {sendingWaPdf === r.receiptId ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <MessageSquareIcon className="size-4" />
                          )}
                        </Button>
                        <RowActions
                          onView={() => setViewReceipt(r)}
                          onEdit={() => openEdit(i)}
                          onDelete={() => setDeleteIndex(i)}
                        />
                      </div>
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
