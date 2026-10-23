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
import {
  createPayment,
  getPayment,
  paymentMethodLabel,
  PAYMENT_METHOD_NOTES,
  type PaymentMethod,
  type PaymentOrder,
} from "@/lib/payments"
import {
  BanknoteIcon,
  CircleCheckIcon,
  CreditCardIcon,
  ExternalLinkIcon,
  Loader2Icon,
  QrCodeIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  TruckIcon,
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
  { value: "COD", label: "Cash on delivery", icon: TruckIcon },
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
  onCompleted?: (order: PaymentOrder) => void
}) {
  const [open, setOpen] = useState(false)
  const [order, setOrder] = useState<PaymentOrder | null>(null)
  const [method, setMethod] = useState<PaymentMethod>("UPI")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const notified = useRef(false)

  // Form mode state (used on the Payments page).
  const [students, setStudents] = useState<StoredStudent[]>([])
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
        if (
          !created.checkoutUrl &&
          (selectedMethod === "UPI" || selectedMethod === "COD")
        ) {
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

  useEffect(() => {
    if (!open || !requireForm) return
    loadStudents()
      .then(setStudents)
      .catch(() => setStudents([]))
  }, [open, requireForm])

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
  const isCod = activeMethod === "COD"
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
      <Button onClick={start} disabled={disabled}>
        <WalletIcon />
        {label}
      </Button>

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
                ? isCod
                  ? "COD order placed"
                  : "Payment received"
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
                ? isCod
                  ? "The COD order is placed. Cash is due on delivery; the fee stays unpaid until cash is collected."
                  : "The receipt has been recorded automatically."
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
                {students.length > 0 ? (
                  <Field>
                    <FieldLabel htmlFor="payment-student">Student</FieldLabel>
                    <select
                      id="payment-student"
                      className={selectClassName}
                      value={form.studentId}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, studentId: e.target.value }))
                      }
                      required
                    >
                      <option value="" disabled>
                        Select student
                      </option>
                      {students.map((s) => (
                        <option key={s.studentId} value={s.studentId}>
                          {s.studentName} ({s.studentId})
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="payment-student-name">
                      Student name
                    </FieldLabel>
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
                      No students found. The receipt will use this name.
                    </p>
                  </Field>
                )}

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
                              : "Collect the card payment at the front desk, then confirm this payment in the Payments page."}
                          </p>
                          <p className="mt-2 text-xs text-muted-foreground">
                            This dialog updates automatically when the cashier
                            confirms.
                          </p>
                        </div>
                      ) : (
                        <>
                          {isCod && (
                            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                              This is a Cash on Delivery order. Complete the COD
                              step in the checkout. The fee is not marked paid
                              until cash is collected.
                            </p>
                          )}
                          <div className="overflow-hidden rounded-xl border bg-muted/30">
                            <iframe
                              src={order.checkoutUrl}
                              title={`YOUPI PG ${methodLabel} checkout`}
                              className="h-[540px] w-full border-0"
                              allow="clipboard-write"
                            />
                          </div>
                        </>
                      )}

                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Loader2Icon className="size-3.5 animate-spin" />
                          {isCounter
                            ? "Waiting for the counter…"
                            : isCod
                              ? "Waiting for the COD order to be placed…"
                              : "Waiting for UPI confirmation…"}
                        </span>
                        {!isCounter && (
                          <a
                            href={order.checkoutUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
                          >
                            Open in new tab
                            <ExternalLinkIcon className="size-3.5" />
                          </a>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] text-muted-foreground">
                          Order {order.orderId}
                          {order.paymentId ? ` · ${order.paymentId}` : ""}
                        </p>
                        <StatusBadge value={order.status} />
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
                  <div
                    className={
                      isCod
                        ? "flex flex-col items-center gap-3 rounded-xl border border-sky-200 bg-sky-50/60 px-6 py-10 text-center dark:border-sky-500/20 dark:bg-sky-500/10"
                        : "flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-6 py-10 text-center dark:border-emerald-500/20 dark:bg-emerald-500/10"
                    }
                  >
                    {isCod ? (
                      <TruckIcon className="size-8 text-sky-600 dark:text-sky-400" />
                    ) : (
                      <CircleCheckIcon className="size-8 text-emerald-600 dark:text-emerald-400" />
                    )}
                    <p className="text-sm font-semibold text-foreground">
                      {isCod ? "COD order placed" : "Payment confirmed"}
                    </p>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      {isCod
                        ? `${formatInr(order.amount)} is due in cash on delivery. No receipt has been created yet.`
                        : `${formatInr(order.amount)} received via ${methodLabel}.`}
                    </p>
                    {order.receiptId ? (
                      <p className="rounded-full border bg-card px-3 py-1 text-xs font-medium">
                        Receipt {order.receiptId}
                      </p>
                    ) : isCod ? (
                      <StatusBadge value="COD_PLACED" />
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Receipt is being recorded…
                      </p>
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
                  <Button onClick={() => setOpen(false)}>Done</Button>
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
