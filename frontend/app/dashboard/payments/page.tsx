"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { StatusBadge } from "@/components/status-badge"
import { EmptyState } from "@/components/empty-state"
import { LiveBadge } from "@/components/live-badge"
import { PayWithGateway } from "@/components/pay-with-gateway"
import { PaymentSetup } from "@/components/payment-setup"
import { PaymentTimeline } from "@/components/payment-timeline"
import Stats01 from "@/components/stats-01"
import { Button } from "@/components/ui/button"
import { useLiveReload } from "@/hooks/use-live-reload"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  confirmCounterPayment,
  declineCounterPayment,
  listPayments,
  paymentMethodLabel,
  type PaymentOrder,
} from "@/lib/payments"
import {
  BanknoteIcon,
  CheckIcon,
  Clock3Icon,
  CreditCardIcon,
  ExternalLinkIcon,
  Loader2Icon,
  QrCodeIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
  XIcon,
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

const STATUS_OPTIONS = [
  "INITIATED",
  "QUEUED",
  "ACTIVE",
  "PROCESSING",
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "SUSPICIOUS",
  "BLOCKED",
  "REFUNDED",
]

const METHOD_ICONS: Record<string, LucideIcon> = {
  UPI: QrCodeIcon,
  CASH_COUNTER: BanknoteIcon,
  CARD_COUNTER: CreditCardIcon,
}

function formatAmount(value: string | number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return `₹ ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDate(value: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function normalizeStatus(status: string) {
  return status === "CANCELED" ? "CANCELLED" : status
}

function isCounterMethod(method: string) {
  return method === "CASH_COUNTER" || method === "CARD_COUNTER"
}

function isPaid(order: PaymentOrder) {
  return order.status === "SUCCESS" && !!order.receiptId
}

function MethodCell({ method }: { method: string }) {
  const Icon = METHOD_ICONS[method] ?? QrCodeIcon
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-3.5 text-muted-foreground" />
      {paymentMethodLabel(method)}
    </span>
  )
}

export default function PaymentsPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [timelineOrder, setTimelineOrder] = useState<PaymentOrder | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const reload = useCallback(() => {
    listPayments()
      .then((rows) => {
        setOrders(rows)
        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load payments")
      })
      .finally(() => setHydrated(true))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useLiveReload(reload, 5000)

  const filteredOrders = useMemo(() => {
    if (statusFilter === "ALL") return orders
    return orders.filter((order) => normalizeStatus(order.status) === statusFilter)
  }, [orders, statusFilter])

  const paid = orders.filter(isPaid)
  const awaiting = orders.filter((order) => !TERMINAL.has(order.status)).length
  const receipts = paid.length
  const collected = paid.reduce(
    (sum, order) => sum + (Number(order.amount) || 0),
    0
  )
  const decided = orders.filter((order) => TERMINAL.has(order.status)).length
  const successRate =
    decided === 0 ? 0 : Math.round((paid.length / decided) * 100)

  const stats = [
    {
      name: "Collected",
      value: formatAmount(collected),
      change: `${paid.length} settled`,
      changeType: "positive" as const,
    },
    {
      name: "Awaiting payment",
      value: String(awaiting),
      change: "live",
      changeType: "neutral" as const,
    },
    {
      name: "Receipts created",
      value: String(receipts),
      change: "auto-recorded",
      changeType: "neutral" as const,
    },
    {
      name: "Success rate",
      value: `${successRate}%`,
      change: `${orders.length} orders`,
      changeType: "neutral" as const,
    },
  ]

  async function handleConfirm(order: PaymentOrder) {
    const label = paymentMethodLabel(order.method)
    const confirmed = window.confirm(
      `Confirm ${label} payment of ${formatAmount(order.amount)} for ${order.studentName || "this student"}?`
    )
    if (!confirmed) return

    setActionId(order.orderId)
    setActionError(null)
    try {
      await confirmCounterPayment(order.orderId)
      reload()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not confirm the counter payment"
      )
    } finally {
      setActionId(null)
    }
  }

  async function handleDecline(order: PaymentOrder) {
    const reason = window.prompt(
      "Reason for declining this counter payment?",
      "Cash not received"
    )
    if (reason === null) return

    setActionId(order.orderId)
    setActionError(null)
    try {
      await declineCounterPayment(
        order.orderId,
        reason.trim() || "Declined at the counter"
      )
      reload()
    } catch (err) {
      setActionError(
        err instanceof Error
          ? err.message
          : "Could not decline the counter payment"
      )
    } finally {
      setActionId(null)
    }
  }

  return (
    <DashboardShell
      trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Payments" }]}
    >
      <PageHeader
        title="Payments"
        description="Collect fees via UPI or cash/card at the counter. Verified payments create a receipt and mark the matching fee paid automatically."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {orders.length} orders
            </span>
            <LiveBadge />
          </span>
        }
        actions={
          <PayWithGateway
            requireForm
            label="Collect payment"
            onCompleted={reload}
          />
        }
      />

      <PaymentSetup onSaved={reload} />

      <Stats01 stats={stats} />

      {error && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Could not load payments</p>
            <p className="mt-0.5 text-red-700/80 dark:text-red-400/80">
              {error}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={reload}
            className="shrink-0"
          >
            <RefreshCwIcon />
            Retry
          </Button>
        </div>
      )}

      {actionError && (
        <div className="flex flex-wrap items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
          <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">Counter action failed</p>
            <p className="mt-0.5 text-red-700/80 dark:text-red-400/80">
              {actionError}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setActionError(null)}
            className="shrink-0"
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label
            htmlFor="payment-status-filter"
            className="text-xs font-medium text-muted-foreground"
          >
            Status
          </label>
          <select
            id="payment-status-filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-8 rounded-lg border border-input bg-card px-2 text-xs shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-[border-color,box-shadow] duration-200 hover:border-foreground/20 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
          >
            <option value="ALL">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredOrders.length} of {orders.length} shown
        </p>
      </div>

      <div className="data-table-surface">
        <div className="data-table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">#</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Student</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>UTR</TableHead>
                <TableHead>Receipt</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hydrated ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={QrCodeIcon}
                      title="Loading payments…"
                      hint="Fetching payment orders from the backend."
                    />
                  </TableCell>
                </TableRow>
              ) : orders.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={QrCodeIcon}
                      title="No payments yet"
                      hint="Click Collect payment above to start a UPI or counter checkout."
                    />
                  </TableCell>
                </TableRow>
              ) : filteredOrders.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={QrCodeIcon}
                      title="No payments match this filter"
                      hint="Choose All statuses to see every order."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredOrders.map((order, index) => {
                  const busy = actionId === order.orderId
                  const counter = isCounterMethod(order.method)

                  return (
                    <TableRow key={order.orderId}>
                      <TableCell className="text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.orderId}
                      </TableCell>
                      <TableCell
                        className="font-medium text-foreground"
                        title={order.studentId}
                      >
                        {order.studentName || "—"}
                        {order.studentId ? (
                          <span className="ml-1 font-mono text-xs font-normal text-muted-foreground">
                            ({order.studentId})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatAmount(order.amount)}
                      </TableCell>
                      <TableCell>
                        <MethodCell method={order.method} />
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge value={order.status} />
                          {order.status === "PROCESSING" &&
                          order.gatewayStatus === "SUCCESS" ? (
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              Gateway confirmed · receipt pending
                            </span>
                          ) : null}
                          {counter && !TERMINAL.has(order.status) ? (
                            <span className="text-[10px] leading-tight text-muted-foreground">
                              Awaiting counter confirmation
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.utr || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {order.receiptId || "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {formatDate(order.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {counter && !TERMINAL.has(order.status) && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => void handleConfirm(order)}
                              >
                                {busy ? (
                                  <Loader2Icon className="animate-spin" />
                                ) : (
                                  <CheckIcon />
                                )}
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void handleDecline(order)}
                              >
                                <XIcon />
                                Decline
                              </Button>
                            </>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setTimelineOrder(order)}
                          >
                            <Clock3Icon />
                            History
                          </Button>
                          {order.checkoutUrl &&
                          !TERMINAL.has(order.status) &&
                          !counter ? (
                            <a
                              href={order.checkoutUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-7 items-center gap-1 rounded-[10px] px-2 text-[0.8rem] font-medium text-foreground underline-offset-4 hover:bg-muted hover:underline"
                            >
                              <ExternalLinkIcon className="size-3.5" />
                              Open
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {orders.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              {orders.length} order{orders.length === 1 ? "" : "s"}
            </span>
            <span className="hidden sm:block">
              Webhook-verified payments create a receipt automatically.
            </span>
          </div>
        )}
      </div>

      <PaymentTimeline
        order={timelineOrder}
        open={!!timelineOrder}
        onOpenChange={(open) => {
          if (!open) setTimelineOrder(null)
        }}
      />
    </DashboardShell>
  )
}
