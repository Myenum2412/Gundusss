"use client"

import { useEffect, useState } from "react"
import { cn } from "cn"
import { StatusBadge } from "@/components/status-badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getPayment,
  paymentMethodLabel,
  type PaymentEvent,
  type PaymentOrder,
} from "@/lib/payments"
import {
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react"

const SOURCE_LABELS: Record<string, string> = {
  create: "Order created",
  webhook: "Gateway webhook",
  "gateway-poll": "Gateway poll",
  "counter-confirm": "Counter confirmation",
  "counter-decline": "Counter decline",
  current: "Current status",
}

function formatAmount(value: string | number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  return `₹ ${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDateTime(value: string) {
  if (!value) return "—"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function dotFor(status: string) {
  const value = status.toUpperCase()
  if (value === "SUCCESS" || value === "PAID") return "bg-emerald-500"
  if (["FAILED", "EXPIRED", "CANCELLED", "CANCELED", "BLOCKED"].includes(value)) {
    return "bg-red-500"
  }
  if (value === "SUSPICIOUS") return "bg-orange-500"
  if (value === "REFUNDED") return "bg-sky-500"
  return "bg-amber-500"
}

export function PaymentTimeline({
  order,
  open,
  onOpenChange,
}: {
  order: PaymentOrder | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [events, setEvents] = useState<PaymentEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // Ignore clipboard error
    }
  }

  useEffect(() => {
    if (!open || !order) return
    let cancelled = false
    setEvents(order.events ?? [])
    setLoading(true)
    setError(null)

    getPayment(order.orderId)
      .then((next) => {
        if (cancelled) return
        setEvents(next.events ?? [])
      })
      .catch((err) => {
        if (cancelled) return
        setError(
          err instanceof Error ? err.message : "Could not load payment history"
        )
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, order])

  const fallbackEvents: PaymentEvent[] = order
    ? [
        {
          id: 0,
          orderId: order.orderId,
          status: order.status,
          gatewayStatus: order.gatewayStatus,
          method: order.method,
          source: "current",
          message: "Current status from the payment record.",
          createdAt: order.updatedAt || order.createdAt,
        },
      ]
    : []

  const displayed = events.length > 0 ? events : fallbackEvents

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight">
            Payment history
          </DialogTitle>
          <DialogDescription>
            {order
              ? `${order.studentName || "Student"} · ${formatAmount(
                  order.amount
                )} · ${paymentMethodLabel(order.method)}`
              : "Payment lifecycle events"}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          {order && (order.paymentUrl || order.checkoutUrl) ? (
            <div className="mb-5 flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Payment URL
                </span>
                <p className="truncate font-mono text-xs font-medium text-foreground">
                  {order.paymentUrl || order.checkoutUrl}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void copyUrl(order.paymentUrl || order.checkoutUrl)}
                  className="gap-1"
                >
                  {copied ? (
                    <>
                      <CheckIcon className="size-3 text-emerald-600" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <CopyIcon className="size-3" />
                      <span>Copy</span>
                    </>
                  )}
                </Button>
                <a
                  href={order.paymentUrl || order.checkoutUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({
                    variant: "ghost",
                    size: "xs",
                    className: "gap-1",
                  })}
                >
                  <span>Open</span>
                  <ExternalLinkIcon className="size-3" />
                </a>
              </div>
            </div>
          ) : null}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading history…
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-8 text-center">
              <TriangleAlertIcon className="size-5 text-red-600" />
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setError(null)
                  if (order) {
                    getPayment(order.orderId)
                      .then((next) => setEvents(next.events ?? []))
                      .catch((err) =>
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not load payment history"
                        )
                      )
                  }
                }}
              >
                <RefreshCwIcon />
                Retry
              </Button>
            </div>
          )}

          {!loading && !error && displayed.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No lifecycle events have been recorded for this payment yet.
            </p>
          )}

          {!loading && !error && displayed.length > 0 && (
            <ol className="relative space-y-5 border-l border-border pl-5">
              {displayed.map((event, index) => (
                <li key={`${event.id}-${index}`} className="relative">
                  <span
                    className={cn(
                      "absolute -left-[26px] top-1 size-2.5 rounded-full ring-4 ring-background",
                      dotFor(event.status)
                    )}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={event.status} />
                    <span className="text-[11px] text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-foreground">
                    {event.message || `Status changed to ${event.status}.`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {(SOURCE_LABELS[event.source] ?? event.source) || "System"}
                    {event.method
                      ? ` · ${paymentMethodLabel(event.method)}`
                      : ""}
                    {event.gatewayStatus
                      ? ` · gateway ${event.gatewayStatus}`
                      : ""}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
