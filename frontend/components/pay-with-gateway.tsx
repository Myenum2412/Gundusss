"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { cn } from "cn"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { StatusBadge } from "@/components/status-badge"
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadFeeStructures, type StoredFeeStructure } from "@/lib/fee-structures-store"
import { loadGroups, type StoredGroup } from "@/lib/groups-store"
import { resolveStudentFee } from "@/lib/fee-lookup"
import {
  confirmPayment,
  createPayment,
  getPayment,
  paymentMethodLabel,
  PAYMENT_METHOD_NOTES,
  type PaymentMethod,
  type PaymentOrder,
} from "@/lib/payments"
import { downloadReceiptPdf } from "@/lib/receipts-store"
import {
  BanknoteIcon,
  CheckIcon,
  CircleCheckIcon,
  CopyIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  FileDownIcon,
  Loader2Icon,
  QrCodeIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react"

const TERMINAL = new Set([
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "SUSPICIOUS",
  "BLOCKED",
  "REFUNDED",
])

const selectClassName =
  "h-9 w-full min-w-0 rounded-[10px] border border-input bg-card px-3 py-1 text-sm shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"

const METHOD_OPTIONS: Array<{
  value: PaymentMethod
  label: string
  icon: LucideIcon
}> = [
  { value: "UPI", label: "UPI", icon: QrCodeIcon },
  { value: "CASH_COUNTER", label: "Cash at counter", icon: BanknoteIcon },
  { value: "CARD_COUNTER", label: "Card at counter", icon: CreditCardIcon },
]

function formatInr(value: string | number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return `₹ ${value}`
  return `₹ ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function MethodPicker({
  value,
  onChange,
}: {
  value: PaymentMethod
  onChange: (method: PaymentMethod) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {METHOD_OPTIONS.map((option) => {
        const Icon = option.icon
        const active = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-start gap-3 rounded-xl border p-3 text-left transition",
              active
                ? "border-foreground/30 bg-muted/60 ring-2 ring-ring/20"
                : "border-border bg-card hover:border-foreground/20 hover:bg-muted/30"
            )}
          >
            <span
              className={cn(
                "mt-0.5 rounded-lg p-2",
                active
                  ? "bg-foreground text-background"
                  : "bg-muted text-muted-foreground"
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium">{option.label}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {PAYMENT_METHOD_NOTES[option.value]}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function PayWithGateway({
  studentId,
  studentName,
  amount,
  feeId,
  description,
  disabled,
  label = "Collect payment",
  requireForm = false,
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onCompleted,
}: {
  studentId?: string
  studentName?: string
  amount?: number | string
  feeId?: number
  description?: string
  disabled?: boolean
  label?: string
  requireForm?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onCompleted?: (order: PaymentOrder) => void
}) {
  const [internalOpen, setInternalOpen] = useState(false)
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = useCallback(
    (next: boolean) => {
      if (isControlled) {
        setControlledOpen?.(next)
      } else {
        setInternalOpen(next)
      }
    },
    [isControlled, setControlledOpen]
  )
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [method, setMethod] = useState<PaymentMethod>("UPI")
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const notified = useRef(false)

  // Form mode state (used on the Payments page).
  const [students, setStudents] = useState<StoredStudent[]>([])
  const [feeStructures, setFeeStructures] = useState<StoredFeeStructure[]>([])
  const [groups, setGroups] = useState<StoredGroup[]>([])
  const [form, setForm] = useState({
    studentId: "",
    manualName: "",
    amount: "",
    note: "",
  })

  const begin = useCallback(
    async (
      input: {
        studentId?: string
        studentName: string
        amount: number | string
        description?: string
      },
      selectedMethod: PaymentMethod
    ) => {
      setMethod(selectedMethod)
      setLoading(true)
      setError(null)
      setOrder(null)
      notified.current = false
      try {
        const created = await createPayment({
          ...input,
          feeId,
          method: selectedMethod,
        })
        if (!created.checkoutUrl && selectedMethod === "UPI") {
          throw new Error("Payment gateway did not return a checkout URL")
        }
        setOrder(created)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not start payment")
      } finally {
        setLoading(false)
      }
    },
    [feeId]
  )

  const start = useCallback(() => {
    setOpen(true)
    setOrder(null)
    setError(null)
    notified.current = false
  }, [])

  const [loadingStudents, setLoadingStudents] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoadingStudents(true)
    Promise.allSettled([loadStudents(), loadFeeStructures(), loadGroups()])
      .then(([stuRes, feeRes, grpRes]) => {
        if (stuRes.status === "fulfilled") setStudents(stuRes.value)
        if (feeRes.status === "fulfilled") setFeeStructures(feeRes.value)
        if (grpRes.status === "fulfilled") setGroups(grpRes.value)
      })
      .catch((err) => {
        console.error("Failed to load dependency data in payment dialog", err)
      })
      .finally(() => setLoadingStudents(false))
  }, [open])

  const orderId = order?.orderId
  const status = order?.status

  useEffect(() => {
    if (!open || !orderId) return
    if (status && TERMINAL.has(status)) return

    let cancelled = false
    const poll = async () => {
      try {
        const next = await getPayment(orderId)
        if (cancelled) return
        setOrder(next)
        if (next.status === "SUCCESS" && !notified.current) {
          notified.current = true
          onCompleted?.(next)
        }
      } catch {
        // Keep polling; transient backend/gateway hiccups are expected.
      }
    }

    void poll()
    const timer = setInterval(poll, 3000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open, orderId, status, onCompleted])

  const activeMethod = (order?.method || method) as PaymentMethod
  const isCounter =
    activeMethod === "CASH_COUNTER" || activeMethod === "CARD_COUNTER"
  const methodLabel = paymentMethodLabel(activeMethod)

  const successful = order?.status === "SUCCESS"
  const processing = order?.status === "PROCESSING"
  const failed = !!order && TERMINAL.has(order.status) && !successful
  const showForm = requireForm && !order
  const showMethodPicker = !requireForm && !order && !loading && !error
  const canStart =
    !!studentName && Number.isFinite(Number(amount)) && Number(amount) > 0

  function submitForm(e: React.FormEvent) {
    e.preventDefault()
    const selected = students.find((s) => s.studentId === form.studentId)
    const name = selected?.studentName ?? form.manualName.trim()
    const value = Number(form.amount)
    if (!name) {
      setError("Choose a student or enter a student name.")
      return
    }
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than zero.")
      return
    }
    void begin(
      {
        studentId: selected?.studentId,
        studentName: name,
        amount: value,
        description: form.note.trim() || description,
      },
      method
    )
  }

  function retry() {
    setOrder(null)
    setError(null)
    notified.current = false
  }

  function reset() {
    retry()
    setForm({ studentId: "", manualName: "", amount: "", note: "" })
    setMethod("UPI")
  }

  const selectedIcon =
    METHOD_OPTIONS.find((option) => option.value === activeMethod)?.icon ??
    QrCodeIcon
  const SelectedIcon = selectedIcon

  return (
    <>
      {!isControlled && (
        <Button onClick={start} disabled={disabled}>
          <WalletIcon />
          {label}
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) reset()
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold tracking-tight">
              {successful
                ? "Payment received"
                : processing
                  ? "Confirming payment"
                  : showForm
                    ? "Collect payment"
                    : showMethodPicker
                      ? "Choose payment method"
                      : `${methodLabel} checkout`}
            </DialogTitle>
            <DialogDescription>
              {successful
                ? "The receipt has been recorded automatically."
                : processing
                  ? isCounter
                    ? "The counter confirmed the payment. The receipt is being recorded now."
                    : "The payment was detected. Your receipt is being recorded now."
                  : showForm
                    ? "Choose a student, amount, and payment method."
                    : showMethodPicker
                      ? `${studentName ?? "Student"} · ${formatInr(amount ?? 0)}`
                      : `${studentName ?? "Student"} · ${formatInr(
                          order?.amount ?? amount ?? 0
                        )}`}
            </DialogDescription>
          </DialogHeader>

          {showForm ? (
            <form onSubmit={submitForm} className="flex flex-col">
              <div className="grid gap-4 px-6 py-5">
                <Field>
                  <div className="flex items-center justify-between">
                    <FieldLabel htmlFor="payment-student">Student</FieldLabel>
                    {loadingStudents ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2Icon className="size-3 animate-spin" />
                        Loading students...
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {students.length} student{students.length === 1 ? "" : "s"} found
                      </span>
                    )}
                  </div>
                  {students.length > 0 ? (
                    <div className="space-y-2">
                      <select
                        id="payment-student"
                        className={selectClassName}
                        value={form.studentId}
                        onChange={(e) => {
                          const val = e.target.value
                          const matched = students.find((s) => s.studentId === val)
                          if (matched) {
                            const fee = resolveStudentFee(matched, feeStructures, groups)
                            setForm((f) => ({
                              ...f,
                              studentId: val,
                              manualName: matched.studentName,
                              amount: fee.amount || f.amount,
                              note: f.note || `Fee payment for ${matched.course || "Course"} (${matched.group || "Regular"})`,
                            }))
                          } else {
                            setForm((f) => ({
                              ...f,
                              studentId: val,
                              manualName: val === "__custom__" ? "" : f.manualName,
                            }))
                          }
                        }}
                        required={!form.manualName}
                      >
                        <option value="">
                          -- Select student from dropdown --
                        </option>
                        {students.map((s) => (
                          <option key={s.studentId} value={s.studentId}>
                            {s.studentName} ({s.studentId}){s.group ? ` · ${s.group}` : ""}{s.course ? ` · ${s.course}` : ""}
                          </option>
                        ))}
                        <option value="__custom__">
                          + Other student / Enter name manually
                        </option>
                      </select>

                      {form.studentId && form.studentId !== "__custom__" ? (
                        (() => {
                          const s = students.find((x) => x.studentId === form.studentId)
                          if (!s) return null
                          const fee = resolveStudentFee(s, feeStructures, groups)
                          return (
                            <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 items-center">
                              <span><strong className="text-foreground">ID:</strong> {s.studentId}</span>
                              <span><strong className="text-foreground">Name:</strong> {s.studentName}</span>
                              {s.group ? <span><strong className="text-foreground">Group:</strong> {s.group}</span> : null}
                              {s.course ? <span><strong className="text-foreground">Course:</strong> {s.course}</span> : null}
                              {s.phone ? <span><strong className="text-foreground">Phone:</strong> {s.phone}</span> : null}
                              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
                                Standard Due: ₹{fee.amount} ({fee.frequency || "Monthly"})
                              </span>
                            </div>
                          )
                        })()
                      ) : null}

                      {form.studentId === "__custom__" ? (
                        <div className="mt-2">
                          <Input
                            placeholder="Type student name manually"
                            value={form.manualName}
                            onChange={(e) =>
                              setForm((f) => ({ ...f, manualName: e.target.value }))
                            }
                            required
                          />
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Input
                        id="payment-student-name"
                        placeholder="Enter student name"
                        value={form.manualName}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, manualName: e.target.value }))
                        }
                        required
                      />
                      <p className="text-xs text-muted-foreground">
                        No students enrolled yet. The payment will use this student name.
                      </p>
                    </div>
                  )}
                </Field>

                <Field>
                  <FieldLabel htmlFor="payment-amount">Amount (₹)</FieldLabel>
                  <Input
                    id="payment-amount"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="₹ Enter amount"
                    value={form.amount}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, amount: e.target.value }))
                    }
                    required
                  />
                </Field>

                <Field>
                  <FieldLabel>Payment method</FieldLabel>
                  <MethodPicker value={method} onChange={setMethod} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="payment-note">Note (optional)</FieldLabel>
                  <Input
                    id="payment-note"
                    placeholder="e.g. Term 2 tuition fee"
                    value={form.note}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, note: e.target.value }))
                    }
                  />
                </Field>

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
                    {error}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2Icon className="animate-spin" />
                      Starting…
                    </>
                  ) : (
                    "Continue"
                  )}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <>
              <div className="px-6 py-5">
                {loading && (
                  <div className="flex flex-col items-center justify-center gap-3 py-14 text-sm text-muted-foreground">
                    <Loader2Icon className="size-6 animate-spin" />
                    Creating a secure {methodLabel.toLowerCase()} session…
                  </div>
                )}

                {!loading && error && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
                    <TriangleAlertIcon className="size-6 text-red-600" />
                    <p className="text-sm font-medium text-foreground">
                      Could not start the payment
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {error}
                    </p>
                  </div>
                )}

                {showMethodPicker && (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-muted/30 px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        Collecting from
                      </p>
                      <p className="text-sm font-medium">
                        {studentName ?? "Student"} · {formatInr(amount ?? 0)}
                      </p>
                    </div>
                    <MethodPicker value={method} onChange={setMethod} />
                  </div>
                )}

                {!loading &&
                  !error &&
                  order &&
                  !successful &&
                  !failed &&
                  !processing && (
                    <div className="space-y-3">
                      {isCounter ? (
                        <div className="rounded-xl border bg-muted/30 p-5">
                          <div className="flex items-center gap-3">
                            <span className="rounded-xl bg-foreground p-2 text-background">
                              <SelectedIcon className="size-5" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                {methodLabel}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                Order {order.orderId}
                              </p>
                            </div>
                          </div>
                          <div className="mt-4 rounded-lg border bg-card p-4">
                            <p className="text-xs text-muted-foreground">
                              Amount to collect
                            </p>
                            <p className="text-2xl font-semibold tracking-tight">
                              {formatInr(order.amount)}
                            </p>
                          </div>
                          <p className="mt-3 text-sm text-muted-foreground">
                            {order.method === "CASH_COUNTER"
                              ? "Collect cash at the front desk, then confirm this payment in the Payments page."
                              : "Collect the card payment on the office POS terminal, then confirm it in the Payments page."}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            This dialog updates automatically when the cashier
                            confirms.
                          </p>
                        </div>
                      ) : (
                        <div className="overflow-hidden rounded-xl border bg-muted/30">
                          <iframe
                            src={order.checkoutUrl}
                            title={`MyFees ${methodLabel} checkout`}
                            className="h-[540px] w-full border-0"
                            allow="clipboard-write"
                          />
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Loader2Icon className="size-3.5 animate-spin" />
                          {isCounter
                            ? "Waiting for the counter…"
                            : "Waiting for UPI confirmation…"}
                        </span>
                        {!isCounter && (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={async () => {
                                const url = order.paymentUrl || order.checkoutUrl
                                if (!url) return
                                try {
                                  await navigator.clipboard.writeText(url)
                                  setCopiedUrl(true)
                                  window.setTimeout(() => setCopiedUrl(false), 2000)
                                } catch {
                                  // ignore
                                }
                              }}
                              className="h-6 gap-1 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                            >
                              {copiedUrl ? (
                                <CheckIcon className="size-3 text-emerald-600" />
                              ) : (
                                <CopyIcon className="size-3" />
                              )}
                              <span>{copiedUrl ? "Copied" : "Copy URL"}</span>
                            </Button>
                            <a
                              href={order.paymentUrl || order.checkoutUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                            >
                              Open in new tab
                              <ExternalLinkIcon className="size-3.5" />
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-muted-foreground">
                          Order {order.orderId}
                          {order.paymentId ? ` · ${order.paymentId}` : ""}
                        </p>
                        <StatusBadge value={order.status} />
                      </div>

                      <div className="flex items-center justify-between rounded-xl border border-emerald-600/20 bg-emerald-500/5 p-2.5">
                        <span className="text-xs text-muted-foreground">
                          Payment completed by student?
                        </span>
                        <Button
                          type="button"
                          size="xs"
                          disabled={confirming}
                          onClick={async () => {
                            setConfirming(true)
                            try {
                              const updated = await confirmPayment(order.orderId, {
                                method: order.method,
                              })
                              setOrder(updated)
                              onCompleted?.(updated)
                            } catch (err: any) {
                              setError(err.message || "Failed to confirm payment")
                            } finally {
                              setConfirming(false)
                            }
                          }}
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-xs"
                        >
                          {confirming ? (
                            <Loader2Icon className="size-3 animate-spin" />
                          ) : (
                            <CheckIcon className="size-3" />
                          )}
                          <span>Payment Received (Mark Paid)</span>
                        </Button>
                      </div>
                    </div>
                  )}

                {!loading && !error && processing && order && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 px-6 py-12 text-center dark:border-amber-500/20 dark:bg-amber-500/10">
                    <Loader2Icon className="size-8 animate-spin text-amber-600 dark:text-amber-400" />
                    <p className="text-sm font-semibold text-foreground">
                      {order.gatewayStatus === "SUCCESS"
                        ? "Payment confirmed by the gateway"
                        : "Verifying your payment"}
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {order.gatewayStatus === "SUCCESS"
                        ? "Creating the receipt and marking the fee paid. This usually takes a moment."
                        : "Waiting for the bank confirmation to arrive. Keep this dialog open."}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Order {order.orderId}
                      {order.utr ? ` · UTR ${order.utr}` : ""}
                    </p>
                  </div>
                )}

                {successful && order && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-6 py-10 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10">
                    <CircleCheckIcon className="size-8 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-sm font-semibold text-foreground">
                      Payment confirmed
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {formatInr(order.amount)} received via {methodLabel}.
                    </p>
                    {order.receiptId ? (
                      <div className="flex flex-col items-center gap-2">
                        <p className="rounded-full border bg-card px-3 py-1 text-xs font-medium">
                          Receipt {order.receiptId}
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await downloadReceiptPdf(order.receiptId || order.orderId)
                            } catch (err: any) {
                              alert(err?.message || "Failed to download PDF receipt")
                            }
                          }}
                          className="gap-1.5 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10"
                        >
                          <FileDownIcon className="size-3.5" />
                          <span>Download PDF Receipt</span>
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          Receipt is being recorded…
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              await downloadReceiptPdf(order.orderId)
                            } catch (err: any) {
                              alert(err?.message || "Failed to download PDF receipt")
                            }
                          }}
                          className="gap-1.5 text-xs font-semibold text-primary border-primary/30 hover:bg-primary/10"
                        >
                          <FileDownIcon className="size-3.5" />
                          <span>Download PDF Receipt</span>
                        </Button>
                      </div>
                    )}
                    {order.utr && (
                      <p className="text-xs text-muted-foreground">
                        UTR {order.utr}
                      </p>
                    )}
                  </div>
                )}

                {failed && order && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-10 text-center">
                    <TriangleAlertIcon className="size-7 text-red-600" />
                    <p className="text-sm font-semibold text-foreground">
                      Payment {order.status.toLowerCase().replace("_", " ")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      No receipt was created. You can try again.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Order {order.orderId}
                    </p>
                  </div>
                )}
              </div>

              <DialogFooter>
                {successful ? (
                  <div className="flex items-center justify-end gap-2 w-full">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await downloadReceiptPdf(order?.receiptId || order?.orderId || "")
                        } catch (err: any) {
                          alert(err?.message || "Failed to download PDF receipt")
                        }
                      }}
                      className="gap-1.5"
                    >
                      <FileDownIcon className="size-3.5" />
                      <span>Download PDF</span>
                    </Button>
                    <Button onClick={() => setOpen(false)}>Done</Button>
                  </div>
                ) : failed ? (
                  <>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Close
                    </Button>
                    <Button onClick={retry}>
                      <RefreshCwIcon />
                      Try again
                    </Button>
                  </>
                ) : error && !order ? (
                  <>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Close
                    </Button>
                    <Button onClick={retry}>
                      <RefreshCwIcon />
                      Try again
                    </Button>
                  </>
                ) : showMethodPicker ? (
                  <>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      disabled={!canStart}
                      onClick={() =>
                        void begin(
                          {
                            studentId,
                            studentName: studentName ?? "",
                            amount: amount ?? 0,
                            description,
                          },
                          method
                        )
                      }
                    >
                      Continue
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
