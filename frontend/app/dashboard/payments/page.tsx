"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { DashboardShell, PageHeader } from "@/components/dashboard-shell"
import { useAuth } from "@/components/auth-provider"
import { StatusBadge } from "@/components/status-badge"
import { EmptyState } from "@/components/empty-state"
import { LiveBadge } from "@/components/live-badge"
import { PayWithGateway } from "@/components/pay-with-gateway"
import { PaymentTimeline } from "@/components/payment-timeline"
import Stats01 from "@/components/stats-01"
import { Button, buttonVariants } from "@/components/ui/button"
import { useLiveReload } from "@/hooks/use-live-reload"
import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import { loadStudents, type StoredStudent } from "@/lib/students-store"
import { loadReceipts, type StoredReceipt } from "@/lib/receipts-store"
import { loadFeeStructures, type StoredFeeStructure } from "@/lib/fee-structures-store"
import { getWaStatus, sendWaMessage, type WaState } from "@/lib/api"
import { CtaUrlBubble } from "@/components/ui/whatsapp/cta-url-bubble"
import "@/components/ui/whatsapp/styles/whatsapp.css"
import {
  BanknoteIcon,
  BellRingIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Clock3Icon,
  CopyIcon,
  CreditCardIcon,
  EllipsisIcon,
  ExternalLinkIcon,
  Link2Icon,
  Loader2Icon,
  PhoneIcon,
  QrCodeIcon,
  ReceiptIcon,
  RefreshCwIcon,
  SearchIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UsersIcon,
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
  "SUCCESS",
  "PROCESSING",
  "INITIATED",
  "QUEUED",
  "ACTIVE",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
  "REFUNDED",
  "SUSPICIOUS",
  "BLOCKED",
]


const METHOD_ICONS: Record<string, LucideIcon> = {
  UPI: QrCodeIcon,
  CASH_COUNTER: BanknoteIcon,
  CASH: BanknoteIcon,
  Cash: BanknoteIcon,
  CARD_COUNTER: CreditCardIcon,
  CARD: CreditCardIcon,
  Card: CreditCardIcon,
  "Bank Transfer": CreditCardIcon,
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

function normalizeStatus(status?: string | null) {
  if (!status) return ""
  const s = status.trim().toUpperCase()
  return s === "CANCELED" ? "CANCELLED" : s
}

function isCounterMethod(method?: string) {
  if (!method) return false
  const m = method.toUpperCase()
  return m === "CASH_COUNTER" || m === "CARD_COUNTER" || m === "CASH" || m === "CARD"
}

function cleanPhoneNumber(raw?: string): string {
  if (!raw) return ""
  const digits = raw.replace(/\D/g, "")
  if (digits.length === 10) return `91${digits}`
  return digits
}


function MethodCell({ method }: { method: string }) {
  const Icon = METHOD_ICONS[method] ?? METHOD_ICONS[method.toUpperCase()] ?? QrCodeIcon
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Icon className="size-3.5 text-muted-foreground" />
      {paymentMethodLabel(method)}
    </span>
  )
}

export interface UnifiedPaymentRecord {
  id: string
  orderId: string
  paymentId?: string | null
  studentId: string
  studentName: string
  course: string
  group: string
  phone: string
  email: string
  amount: string | number
  method: string
  status: string
  gatewayStatus?: string
  paymentUrl?: string
  utr?: string
  receiptId?: string | null
  createdAt: string
  source: "gateway" | "receipt" | "student"
  rawOrder?: PaymentOrder
  rawReceipt?: StoredReceipt
  rawStudent?: StoredStudent
}

function generateReminderText({
  record,
  companyName,
  workspacePaymentUrl,
}: {
  record: UnifiedPaymentRecord
  companyName: string
  workspacePaymentUrl: string
}) {
  const org = companyName ? companyName.trim() : "Institute Office"
  const isPaid = normalizeStatus(record.status) === "SUCCESS"
  const payUrl = record.paymentUrl || workspacePaymentUrl || ""

  if (isPaid) {
    const lines = [
      `*Payment Acknowledgment - ${org}*`,
      ``,
      `Dear Parent / Student ${record.studentName},`,
      `Thank you for completing your fee payment.`,
      ``,
      `• *Student ID:* ${record.studentId || "—"}`,
      `• *Course:* ${record.course || "General"} (${record.group || "Regular"})`,
      `• *Amount Paid:* ${formatAmount(record.amount)}`,
      `• *Receipt ID:* ${record.receiptId || record.orderId}`,
      `• *Status:* Verified & Paid`,
      ``,
      `For any questions, feel free to contact our administrative desk.`,
      `Thank you!`,
    ]
    return lines.join("\n")
  }

  const lines = [
    `*Fee Payment Reminder - ${org}*`,
    ``,
    `Dear Parent / Student ${record.studentName},`,
    `This is a gentle reminder regarding the pending fee payment for *${record.course || "General Course"}* (${record.group || "Batch"}).`,
    ``,
    `• *Student ID:* ${record.studentId || "—"}`,
    `• *Amount Due:* ${formatAmount(record.amount)}`,
    `• *Reference ID:* ${record.orderId}`,
  ]

  if (payUrl) {
    lines.push(``)
    lines.push(`👉 *Click to Pay Now:*`)
    lines.push(`${payUrl}`)
  }

  lines.push(``)
  lines.push(`You can pay securely with any UPI app (GPay, PhonePe, Paytm) or at the counter. If already paid, please ignore this message.`)
  lines.push(`Thank you,`)
  lines.push(`${org}`)

  return lines.join("\n")
}

// Single Student Fee Reminder Dialog using interactive-button-bubble
function FeeReminderDialog({
  record,
  open,
  onOpenChange,
  companyName,
  workspacePaymentUrl,
}: {
  record: UnifiedPaymentRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  companyName: string
  workspacePaymentUrl: string
}) {
  const [phone, setPhone] = useState("")
  const [message, setMessage] = useState("")
  const [copied, setCopied] = useState(false)
  const [sendingBot, setSendingBot] = useState(false)
  const [botSent, setBotSent] = useState(false)
  const [botError, setBotError] = useState<string | null>(null)
  const [waState, setWaState] = useState<WaState | null>(null)

  useEffect(() => {
    if (!record || !open) return
    const initialPhone = record.phone && record.phone !== "—" ? record.phone : ""
    setPhone(initialPhone)
    setMessage(generateReminderText({ record, companyName, workspacePaymentUrl }))
    setCopied(false)
    setBotSent(false)
    setBotError(null)

    getWaStatus()
      .then(setWaState)
      .catch(() => setWaState(null))
  }, [record, open, companyName, workspacePaymentUrl])

  if (!record) return null

  const isPaid = normalizeStatus(record.status) === "SUCCESS"
  const paymentLink = record.paymentUrl || workspacePaymentUrl || ""
  const canSendWa = Boolean(cleanPhoneNumber(phone))

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  async function handleSendViaBot() {
    if (!record) return
    const cleaned = cleanPhoneNumber(phone)
    if (!cleaned) {
      setBotError("Please provide a valid 10-digit mobile number")
      return
    }

    setSendingBot(true)
    setBotError(null)
    setBotSent(false)
    try {
      const cleanBody = `Dear Parent / Student ${record.studentName},\n\nThis is a fee payment notice for *${record.course || "Course"}* (${record.group || "Regular"}).\n\n• Student ID: ${record.studentId || "—"}\n• Amount Due: ${formatAmount(record.amount)}\n• Reference: ${record.orderId}`

      await sendWaMessage({
        to: cleaned,
        message: cleanBody,
        cta: paymentLink
          ? {
              displayText: "Pay Now",
              url: paymentLink,
            }
          : undefined,
      })
      setBotSent(true)
      window.setTimeout(() => setBotSent(false), 3000)
    } catch (err) {
      setBotError(
        err instanceof Error
          ? err.message
          : "Failed to send through WhatsApp bot. Use direct WhatsApp button instead."
      )
    } finally {
      setSendingBot(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden sm:max-w-xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b bg-muted/40 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <BellRingIcon className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Send Fee Reminder
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Preview WhatsApp interactive message bubble with direct Pay Now button.
              </DialogDescription>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 p-5 text-xs max-h-[75vh] overflow-y-auto custom-scroll">
          {/* WhatsApp CTA-URL Message Preview with Pay Now Button */}
          <div className="rounded-2xl border bg-[#e5ddd5]/60 dark:bg-[#0b141a] p-4 flex flex-col items-center justify-center shadow-inner">
            <span className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              WhatsApp CTA-URL Button Preview (Pay Now)
            </span>

            <CtaUrlBubble
              variant="outgoing"
              body={`Dear Parent / Student ${record.studentName},\n\nThis is a fee payment notice for *${record.course || "Course"}* (${record.group || "Regular"}).\n\n• Student ID: ${record.studentId || "—"}\n• Amount Due: ${formatAmount(record.amount)}\n• Reference: ${record.orderId}`}
              footer={`${companyName || "Institute Office"} · Secured UPI / Card payment`}
              displayText="Pay Now"
              url={paymentLink}
              timestamp="Just now"
              status="delivered"
              showTail={true}
              renderAction={(props) => (
                <a
                  href={props.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={props.className}
                  onClick={(e) => {
                    if (!props.href) {
                      e.preventDefault()
                      alert("No payment URL configured for this record")
                    }
                  }}
                >
                  {props.children}
                </a>
              )}
            />

            <span className="mt-2 text-[10px] text-muted-foreground">
              Clicking &ldquo;Pay Now&rdquo; in WhatsApp opens the live UPI payment checkout.
            </span>
          </div>

          {/* Student Overview Card */}
          <div className="flex flex-col gap-2 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground text-sm">
                  {record.studentName}
                </span>
                {record.studentId && record.studentId !== "—" ? (
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {record.studentId}
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground">
                {record.course} · {record.group}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <span className="block text-[10px] uppercase font-semibold text-muted-foreground">
                  {isPaid ? "Paid Amount" : "Pending Amount"}
                </span>
                <span className="font-bold text-foreground tabular-nums text-sm">
                  {formatAmount(record.amount)}
                </span>
              </div>
              <StatusBadge value={record.status} />
            </div>
          </div>

          {/* Recipient Phone Field */}
          <Field>
            <FieldLabel className="text-xs font-semibold">
              Recipient WhatsApp Mobile Number
            </FieldLabel>
            <div className="relative mt-1">
              <PhoneIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
              <Input
                type="tel"
                placeholder="e.g. 9812758346 or +91 9812758346"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-8 text-xs font-mono"
              />
            </div>
            {!canSendWa && (
              <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                Please enter a 10-digit mobile number with or without +91 country code.
              </p>
            )}
          </Field>

          {/* Text Message Content */}
          <Field>
            <div className="flex items-center justify-between">
              <FieldLabel className="text-xs font-semibold">
                Message Content (WhatsApp / SMS)
              </FieldLabel>
              <button
                type="button"
                onClick={() =>
                  setMessage(generateReminderText({ record, companyName, workspacePaymentUrl }))
                }
                className="text-[11px] text-primary hover:underline"
              >
                Reset template
              </button>
            </div>
            <textarea
              rows={6}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="mt-1 w-full rounded-xl border border-input bg-card p-3 font-mono text-xs shadow-xs outline-none transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:border-ring custom-scroll"
            />
          </Field>

          {/* Status notices */}
          {waState && waState.status !== "ready" && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
              <span>WhatsApp bot is not connected.</span>
              <Link href="/dashboard/settings" className="font-semibold underline hover:text-amber-950">
                Connect in Settings
              </Link>
            </div>
          )}

          {botError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400">
              {botError}
            </div>
          )}

          {botSent && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-400">
              Message successfully delivered via WhatsApp bot!
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-col gap-2 border-t bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopy}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <CheckIcon className="size-3.5 text-emerald-600" />
                <span>Copied!</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                <span>Copy Message</span>
              </>
            )}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={sendingBot || !canSendWa}
              onClick={handleSendViaBot}
              className={cn(
                "gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs",
                (!canSendWa || sendingBot) && "opacity-60 cursor-not-allowed"
              )}
            >
              {sendingBot ? (
                <>
                  <Loader2Icon className="size-3.5 animate-spin" />
                  <span>Sending Reminder...</span>
                </>
              ) : botSent ? (
                <>
                  <CheckIcon className="size-3.5 text-white" />
                  <span>Delivered!</span>
                </>
              ) : (
                <>
                  <SendIcon className="size-3.5" />
                  <span>Send Reminder to Them</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Bulk Reminder Dialog for All Awaiting Students
function BulkReminderDialog({
  records,
  open,
  onOpenChange,
  onSelectRecord,
}: {
  records: UnifiedPaymentRecord[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectRecord: (record: UnifiedPaymentRecord) => void
}) {
  const pendingRecords = useMemo(
    () => records.filter((r) => !TERMINAL.has(r.status)),
    [records]
  )
  const totalDue = useMemo(
    () => pendingRecords.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [pendingRecords]
  )
  const [copiedAll, setCopiedAll] = useState(false)

  async function handleCopyList() {
    const lines = [
      `Pending Fee Reminders Summary (${pendingRecords.length} Students):`,
      `Total Pending Volume: ${formatAmount(totalDue)}`,
      ``,
    ]
    pendingRecords.forEach((r, idx) => {
      lines.push(
        `${idx + 1}. ${r.studentName} (${r.studentId || "No ID"}) - ${r.course || "General"} - ${formatAmount(r.amount)} - Phone: ${r.phone || "No phone"}`
      )
    })
    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      setCopiedAll(true)
      window.setTimeout(() => setCopiedAll(false), 2000)
    } catch {
      // ignore
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden sm:max-w-2xl">
        <div className="flex items-start justify-between border-b bg-muted/40 p-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <UsersIcon className="size-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Send Fee Reminders
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {pendingRecords.length} students currently have pending or initiated fees ({formatAmount(totalDue)} total).
              </DialogDescription>
            </div>
          </div>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto custom-scroll text-xs">
          {pendingRecords.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              All students have settled their payments! No pending fees.
            </div>
          ) : (
            <div className="divide-y rounded-xl border">
              {pendingRecords.map((r, i) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 hover:bg-muted/30 transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="size-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                      {i + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {r.studentName}
                        </span>
                        {r.studentId && (
                          <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                            {r.studentId}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        {r.course} · {r.group} · {r.phone && r.phone !== "—" ? r.phone : "No phone"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-end sm:self-center">
                    <span className="font-bold text-foreground tabular-nums">
                      {formatAmount(r.amount)}
                    </span>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        onOpenChange(false)
                        onSelectRecord(r)
                      }}
                      className="gap-1.5 border-emerald-600/40 text-emerald-800 hover:bg-emerald-50 dark:text-emerald-300"
                    >
                      <BellRingIcon className="size-3" />
                      <span>Send Reminder to Them</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t bg-muted/20 p-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyList}
            className="gap-1.5"
          >
            {copiedAll ? (
              <>
                <CheckIcon className="size-3.5 text-emerald-600" />
                <span>Copied Pending Roster!</span>
              </>
            ) : (
              <>
                <CopyIcon className="size-3.5" />
                <span>Copy Pending List</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export default function PaymentsPage() {
  const { can, activeProfile, profile } = useAuth()
  const companyName = activeProfile?.name || profile?.name || ""
  const workspacePaymentUrl = useMemo(() => {
    if (companyName) {
      const slug = companyName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
      if (slug) {
        return `https://myfees.myenum.in/${encodeURIComponent(slug)}`
      }
    }
    return activeProfile?.paymentUrl || profile?.paymentUrl || ""
  }, [companyName, activeProfile?.paymentUrl, profile?.paymentUrl])

  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [students, setStudents] = useState<StoredStudent[]>([])
  const [receipts, setReceipts] = useState<StoredReceipt[]>([])
  const [feeStructures, setFeeStructures] = useState<StoredFeeStructure[]>([])

  const [hydrated, setHydrated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState("ALL")
  const [searchQuery, setSearchQuery] = useState("")

  const [timelineOrder, setTimelineOrder] = useState<PaymentOrder | null>(null)
  const [reminderRecord, setReminderRecord] = useState<UnifiedPaymentRecord | null>(null)
  const [collectRecord, setCollectRecord] = useState<UnifiedPaymentRecord | null>(null)
  const [bulkReminderOpen, setBulkReminderOpen] = useState(false)

  const [actionId, setActionId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const tableScrollRef = useRef<HTMLDivElement>(null)

  const scrollTable = useCallback((direction: "left" | "right") => {
    if (!tableScrollRef.current) return
    const offset = direction === "left" ? -320 : 320
    tableScrollRef.current.scrollBy({ left: offset, behavior: "smooth" })
  }, [])

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      window.setTimeout(() => {
        setCopiedKey((curr) => (curr === key ? null : curr))
      }, 2000)
    } catch {
      // Ignore clipboard write errors
    }
  }, [])

  const reload = useCallback(() => {
    Promise.allSettled([
      listPayments(),
      loadStudents(),
      loadReceipts(),
      loadFeeStructures(),
    ])
      .then(([ordersRes, studentsRes, receiptsRes, feesRes]) => {
        if (ordersRes.status === "fulfilled") {
          setOrders(ordersRes.value)
        } else {
          console.warn("Could not load gateway orders", ordersRes.reason)
        }

        if (studentsRes.status === "fulfilled") {
          setStudents(studentsRes.value)
        } else {
          console.warn("Could not load students", studentsRes.reason)
        }

        if (receiptsRes.status === "fulfilled") {
          setReceipts(receiptsRes.value)
        } else {
          console.warn("Could not load receipts", receiptsRes.reason)
        }

        if (feesRes.status === "fulfilled") {
          setFeeStructures(feesRes.value)
        } else {
          console.warn("Could not load fee structures", feesRes.reason)
        }

        setError(null)
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Could not load payments data")
      })
      .finally(() => setHydrated(true))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useLiveReload(reload, 5000)

  // Unified payment records combining gateway orders, receipts, and enrolled students
  const unifiedRecords = useMemo<UnifiedPaymentRecord[]>(() => {
    const records: UnifiedPaymentRecord[] = []
    const coveredReceiptIds = new Set<string>()
    const studentsWithPayments = new Set<string>()

    // 1. Build student lookup maps
    const studentById = new Map<string, StoredStudent>()
    const studentByName = new Map<string, StoredStudent>()
    for (const s of students) {
      if (s.studentId) studentById.set(s.studentId.trim().toLowerCase(), s)
      if (s.studentName) studentByName.set(s.studentName.trim().toLowerCase(), s)
    }

    // Default fee lookup helper
    const getStudentFee = (student: StoredStudent) => {
      for (const f of feeStructures) {
        if (f.studentIds?.includes(student.studentId)) {
          return f.amount
        }
      }
      for (const f of feeStructures) {
        if (
          (student.course && f.courseGroup?.toLowerCase().includes(student.course.toLowerCase())) ||
          (student.group && f.courseGroup?.toLowerCase().includes(student.group.toLowerCase()))
        ) {
          return f.amount
        }
      }
      return "4500"
    }

    // 2. Add online gateway orders
    for (const order of orders) {
      const stu =
        studentById.get(order.studentId?.trim().toLowerCase()) ||
        studentByName.get(order.studentName?.trim().toLowerCase())

      if (order.receiptId) {
        coveredReceiptIds.add(order.receiptId.trim().toLowerCase())
      }
      if (stu?.studentId) {
        studentsWithPayments.add(stu.studentId.trim().toLowerCase())
      } else if (order.studentName) {
        studentsWithPayments.add(order.studentName.trim().toLowerCase())
      }

      records.push({
        id: `ord-${order.orderId}`,
        orderId: order.orderId,
        paymentId: order.paymentId,
        studentId: order.studentId || stu?.studentId || "—",
        studentName: order.studentName || stu?.studentName || "—",
        course: stu?.course || "—",
        group: stu?.group || "—",
        phone: stu?.phone || "—",
        email: stu?.email || "—",
        amount: order.amount,
        method: order.method || "UPI",
        status: normalizeStatus(order.status) || "INITIATED",
        gatewayStatus: order.gatewayStatus,
        paymentUrl: order.paymentUrl || order.checkoutUrl || "",
        utr: order.utr || "—",
        receiptId: order.receiptId,
        createdAt: order.createdAt || new Date().toISOString(),
        source: "gateway",
        rawOrder: order,
      })
    }

    // 3. Add Appwrite receipts not already tied to an order
    for (const receipt of receipts) {
      const rcpId = receipt.receiptId.trim().toLowerCase()
      if (coveredReceiptIds.has(rcpId)) continue

      const stu =
        studentById.get(receipt.studentId?.trim().toLowerCase()) ||
        studentByName.get(receipt.studentName?.trim().toLowerCase())

      if (stu?.studentId) {
        studentsWithPayments.add(stu.studentId.trim().toLowerCase())
      } else if (receipt.studentName) {
        studentsWithPayments.add(receipt.studentName.trim().toLowerCase())
      }

      const rStatus = receipt.status?.trim().toLowerCase()
      let mappedStatus = "SUCCESS"
      if (rStatus === "paid" || rStatus === "success" || rStatus === "settled") {
        mappedStatus = "SUCCESS"
      } else if (rStatus === "pending" || rStatus === "processing") {
        mappedStatus = "PROCESSING"
      } else if (rStatus === "cancelled" || rStatus === "canceled") {
        mappedStatus = "CANCELLED"
      } else if (rStatus === "failed") {
        mappedStatus = "FAILED"
      } else if (rStatus === "refunded") {
        mappedStatus = "REFUNDED"
      } else if (rStatus) {
        mappedStatus = normalizeStatus(receipt.status)
      }

      let mappedMethod = receipt.method || "Cash"
      if (mappedMethod.toLowerCase() === "cash") mappedMethod = "CASH_COUNTER"
      else if (mappedMethod.toLowerCase() === "upi") mappedMethod = "UPI"
      else if (mappedMethod.toLowerCase() === "card") mappedMethod = "CARD_COUNTER"

      records.push({
        id: `rcp-${receipt.receiptId}`,
        orderId: receipt.receiptId,
        paymentId: null,
        studentId: receipt.studentId || stu?.studentId || "—",
        studentName: receipt.studentName || stu?.studentName || "—",
        course: stu?.course || "—",
        group: stu?.group || "—",
        phone: stu?.phone || "—",
        email: stu?.email || "—",
        amount: receipt.amount,
        method: mappedMethod,
        status: mappedStatus,
        gatewayStatus: mappedStatus === "SUCCESS" ? "SUCCESS" : undefined,
        paymentUrl: "",
        utr: receipt.notes || "—",
        receiptId: receipt.receiptId,
        createdAt: receipt.paymentDate
          ? `${receipt.paymentDate}T00:00:00.000Z`
          : new Date().toISOString(),
        source: "receipt",
        rawReceipt: receipt,
        rawStudent: stu,
      })
    }

    // 4. Add enrolled students awaiting payment
    for (const student of students) {
      const sId = student.studentId?.trim().toLowerCase()
      const sName = student.studentName?.trim().toLowerCase()
      if (
        (sId && studentsWithPayments.has(sId)) ||
        (sName && studentsWithPayments.has(sName))
      ) {
        continue
      }

      const feeAmount = getStudentFee(student)

      records.push({
        id: `stu-${student.studentId}`,
        orderId: `INV-${student.studentId}`,
        paymentId: null,
        studentId: student.studentId,
        studentName: student.studentName,
        course: student.course || "—",
        group: student.group || "—",
        phone: student.phone || "—",
        email: student.email || "—",
        amount: feeAmount,
        method: "UPI",
        status: "INITIATED",
        gatewayStatus: undefined,
        paymentUrl: "",
        utr: "Awaiting fee payment",
        receiptId: null,
        createdAt: student.joiningDate
          ? `${student.joiningDate}T00:00:00.000Z`
          : new Date().toISOString(),
        source: "student",
        rawStudent: student,
      })
    }

    return records.sort((a, b) =>
      String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? ""))
    )
  }, [orders, receipts, students, feeStructures])

  const allStatuses = useMemo(() => {
    const list = [...STATUS_OPTIONS]
    for (const r of unifiedRecords) {
      const s = normalizeStatus(r.status)
      if (s && !list.includes(s)) {
        list.push(s)
      }
    }
    return list
  }, [unifiedRecords])

  const statusStats = useMemo(() => {
    const map: Record<string, { count: number; totalAmount: number }> = {}
    for (const status of allStatuses) {
      map[status] = { count: 0, totalAmount: 0 }
    }
    for (const r of unifiedRecords) {
      const s = normalizeStatus(r.status)
      if (!map[s]) {
        map[s] = { count: 0, totalAmount: 0 }
      }
      map[s].count += 1
      map[s].totalAmount += Number(r.amount) || 0
    }
    return map
  }, [unifiedRecords, allStatuses])

  // Filtered payment records by status and search query
  const filteredRecords = useMemo(() => {
    return unifiedRecords.filter((record) => {
      if (statusFilter !== "ALL" && normalizeStatus(record.status) !== statusFilter) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchName = record.studentName.toLowerCase().includes(q)
        const matchId = record.studentId.toLowerCase().includes(q)
        const matchOrderId = record.orderId.toLowerCase().includes(q)
        const matchCourse = record.course.toLowerCase().includes(q)
        const matchGroup = record.group.toLowerCase().includes(q)
        const matchPhone = record.phone.toLowerCase().includes(q)
        const matchReceipt = (record.receiptId || "").toLowerCase().includes(q)
        if (
          !matchName &&
          !matchId &&
          !matchOrderId &&
          !matchCourse &&
          !matchGroup &&
          !matchPhone &&
          !matchReceipt
        ) {
          return false
        }
      }
      return true
    })
  }, [unifiedRecords, statusFilter, searchQuery])

  // Statistics calculation across all student records
  const paid = unifiedRecords.filter((r) => r.status === "SUCCESS")
  const awaiting = unifiedRecords.filter((r) => !TERMINAL.has(r.status)).length
  const receiptsCount = unifiedRecords.filter((r) => Boolean(r.receiptId)).length
  const collected = paid.reduce(
    (sum, record) => sum + (Number(record.amount) || 0),
    0
  )
  const decided = unifiedRecords.filter((r) => TERMINAL.has(r.status)).length
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
      change: `${students.length} students enrolled`,
      changeType: "neutral" as const,
    },
    {
      name: "Receipts created",
      value: String(receiptsCount),
      change: "auto-recorded",
      changeType: "positive" as const,
    },
    {
      name: "Settlement rate",
      value: `${successRate}%`,
      change: `${decided} total closed`,
      changeType: "neutral" as const,
    },
  ]

  async function handleConfirm(record: UnifiedPaymentRecord) {
    if (!record.rawOrder) return
    const order = record.rawOrder
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

  async function handleDecline(record: UnifiedPaymentRecord) {
    if (!record.rawOrder) return
    const order = record.rawOrder
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

  function openHistory(record: UnifiedPaymentRecord) {
    if (record.rawOrder) {
      setTimelineOrder(record.rawOrder)
    } else {
      const syntheticOrder: PaymentOrder = {
        orderId: record.orderId,
        paymentId: record.paymentId ?? null,
        status: record.status,
        gatewayStatus: record.gatewayStatus || record.status,
        method: record.method,
        utr: record.utr || "",
        amount: String(record.amount),
        studentId: record.studentId,
        studentName: record.studentName,
        feeId: null,
        checkoutUrl: record.paymentUrl || "",
        paymentUrl: record.paymentUrl || "",
        receiptId: record.receiptId ?? null,
        createdAt: record.createdAt,
        updatedAt: record.createdAt,
        events: [
          {
            id: `evt-${record.id}`,
            orderId: record.orderId,
            status: record.status,
            gatewayStatus: record.gatewayStatus || record.status,
            method: record.method,
            source: record.source === "receipt" ? "receipt" : "student",
            message:
              record.source === "receipt"
                ? `Receipt ${record.receiptId || record.orderId} recorded in system for ${record.studentName}.`
                : `Student ${record.studentName} (${record.studentId}) enrolled in ${record.course || "course"}. Fee payment pending collection.`,
            createdAt: record.createdAt,
          },
        ],
      }
      setTimelineOrder(syntheticOrder)
    }
  }

  return (
    <DashboardShell
      trail={[{ label: "Dashboard", href: "/dashboard" }, { label: "Payments" }]}
    >
      <PageHeader
        title="Payments"
        description="Complete fee management and student payment records. Collect fees via UPI QR or counter pass, send interactive WhatsApp reminders with Pay Now button, and manage all enrolled students."
        meta={
          <span className="flex items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground">
              {unifiedRecords.length} records · {students.length} students
            </span>
            <LiveBadge />
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkReminderOpen(true)}
              className="gap-1.5 shadow-xs border-emerald-600/30 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-500/30 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
              title="View and send fee reminders to all students awaiting payment"
            >
              <BellRingIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span>Send Reminder to Them</span>
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                {awaiting}
              </span>
            </Button>
            <PayWithGateway
              requireForm
              label="Collect payment"
              onCompleted={reload}
            />
          </div>
        }
      />

      {workspacePaymentUrl ? (
        <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:items-center">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Link2Icon className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Workspace Public Payment URL
                </span>
                <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                  Online
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-sm font-medium text-foreground">
                {workspacePaymentUrl}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Share this link with students and parents to collect fees online directly.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyToClipboard(workspacePaymentUrl, "workspace-payment-url")}
              className="gap-1.5"
            >
              {copiedKey === "workspace-payment-url" ? (
                <>
                  <CheckIcon className="size-3.5 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <CopyIcon className="size-3.5" />
                  <span>Copy URL</span>
                </>
              )}
            </Button>
            <a
              href={workspacePaymentUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ variant: "default", size: "sm", className: "gap-1.5" })}
            >
              <span>Visit Link</span>
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </div>
        </div>
      ) : null}

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

      {/* Filter and Search Bar */}
      <div className="rounded-xl border bg-card p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
        {/* Search Input and Controls */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 sm:max-w-md">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by student name, ID, course, or ref..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 w-full rounded-lg border border-input bg-card pl-8 pr-7 text-xs shadow-xs outline-none transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:border-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <div className="flex items-center gap-1.5">
              <select
                id="payment-status-filter"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-8 rounded-lg border border-input bg-card px-2.5 text-xs shadow-xs outline-none transition-[border-color,box-shadow] hover:border-foreground/20 focus-visible:border-ring"
              >
                <option value="ALL">All statuses ({unifiedRecords.length})</option>
                {allStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status} ({statusStats[status]?.count ?? 0})
                  </option>
                ))}
              </select>

              {(statusFilter !== "ALL" || searchQuery) && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setStatusFilter("ALL")
                    setSearchQuery("")
                  }}
                  className="h-8 gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <XIcon className="size-3" />
                  Clear
                </Button>
              )}
            </div>

            <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
              {filteredRecords.length} of {unifiedRecords.length} shown
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable Data Table Container */}
      <div className="data-table-surface flex flex-col rounded-2xl border bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)] min-h-[460px] overflow-hidden">
        {/* Table scroll helper toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">Student Payment Records</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {filteredRecords.length} of {unifiedRecords.length} shown
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="hidden sm:inline text-muted-foreground/80">
              Scroll horizontally for all columns
            </span>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                onClick={() => scrollTable("left")}
                title="Scroll table left"
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeftIcon className="size-3.5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon-xs"
                onClick={() => scrollTable("right")}
                title="Scroll table right"
                className="size-6 text-muted-foreground hover:text-foreground"
              >
                <ChevronRightIcon className="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <div
          ref={tableScrollRef}
          className="data-table-scroll custom-scroll flex-1 overflow-x-auto overflow-y-auto scroll-smooth"
        >
          <Table className="w-full min-w-[960px] border-collapse text-sm">
            <TableHeader className="sticky top-0 z-20 bg-card/95 backdrop-blur-xs">
              <TableRow className="border-b hover:bg-transparent">
                <TableHead className="w-12 whitespace-nowrap">#</TableHead>
                <TableHead className="min-w-[150px] whitespace-nowrap">Order / Ref</TableHead>
                <TableHead className="min-w-[200px] whitespace-nowrap">Student</TableHead>
                <TableHead className="min-w-[160px] whitespace-nowrap">Course & Group</TableHead>
                <TableHead className="min-w-[120px] whitespace-nowrap">Amount (₹)</TableHead>
                <TableHead className="min-w-[130px] whitespace-nowrap">Method</TableHead>
                <TableHead className="min-w-[160px] whitespace-nowrap">Status</TableHead>
                <TableHead className="min-w-[120px] whitespace-nowrap">Receipt</TableHead>
                <TableHead className="min-w-[140px] whitespace-nowrap">Date</TableHead>
                <TableHead className="w-16 min-w-[64px] whitespace-nowrap text-right sticky right-0 bg-card z-20 border-l border-border/40 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.04)]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!hydrated ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={QrCodeIcon}
                      title="Loading student payments…"
                      hint="Fetching records from student roster, receipts, and payment gateway."
                    />
                  </TableCell>
                </TableRow>
              ) : unifiedRecords.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={QrCodeIcon}
                      title="No payment records found"
                      hint="Enrolled students will appear here automatically for fee collection."
                    />
                  </TableCell>
                </TableRow>
              ) : filteredRecords.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={10} className="p-0">
                    <EmptyState
                      icon={QrCodeIcon}
                      title="No records match this filter"
                      hint="Clear your search or select All Statuses to see every student."
                    />
                  </TableCell>
                </TableRow>
              ) : (
                filteredRecords.map((record, index) => {
                  const isBusy = actionId === record.orderId
                  const isCounter = isCounterMethod(record.method)
                  const paymentUrl = record.paymentUrl || ""
                  const isCopied = copiedKey === record.orderId

                  return (
                    <TableRow key={record.id} className="group hover:bg-muted/30">
                      <TableCell className="w-12 whitespace-nowrap text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell className="min-w-[150px] whitespace-nowrap font-mono text-xs text-muted-foreground select-all">
                        <div className="flex items-center gap-1.5">
                          <span>{record.orderId}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            onClick={() => void copyToClipboard(record.orderId, record.orderId)}
                            title={isCopied ? "Copied" : "Copy ID"}
                            className="size-5 text-muted-foreground hover:text-foreground opacity-60 group-hover:opacity-100"
                          >
                            {isCopied ? (
                              <CheckIcon className="size-3 text-emerald-600" />
                            ) : (
                              <CopyIcon className="size-3" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[200px] whitespace-nowrap">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-foreground">
                              {record.studentName}
                            </span>
                            {record.studentId && record.studentId !== "—" ? (
                              <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                                {record.studentId}
                              </span>
                            ) : null}
                          </div>
                          {record.phone && record.phone !== "—" ? (
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <PhoneIcon className="size-3" />
                              {record.phone}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[160px] whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-xs">
                            {record.course || "General"}
                          </span>
                          {record.group && record.group !== "—" ? (
                            <span className="text-[11px] text-muted-foreground">
                              {record.group}
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[120px] whitespace-nowrap tabular-nums font-semibold text-foreground">
                        {formatAmount(record.amount)}
                      </TableCell>
                      <TableCell className="min-w-[130px] whitespace-nowrap">
                        <MethodCell method={record.method} />
                      </TableCell>
                      <TableCell className="min-w-[160px] whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge value={record.status} />
                          {record.source === "student" && record.status === "INITIATED" ? (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">
                              Awaiting fee collection
                            </span>
                          ) : null}
                          {record.gatewayStatus &&
                          normalizeStatus(record.gatewayStatus) !==
                            normalizeStatus(record.status) ? (
                            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <span className="text-[10px] font-medium text-muted-foreground/80">
                                Gateway:
                              </span>
                              <StatusBadge
                                value={record.gatewayStatus}
                                className="h-5 px-1.5 py-0 text-[10px]"
                              />
                            </div>
                          ) : null}
                          {record.status === "PROCESSING" &&
                          record.gatewayStatus === "SUCCESS" ? (
                            <span className="text-[10px] leading-tight text-emerald-600 dark:text-emerald-400">
                              Gateway confirmed · receipt pending
                            </span>
                          ) : null}
                          {isCounter && !TERMINAL.has(record.status) ? (
                            <span className="text-[10px] leading-tight text-amber-600 dark:text-amber-400">
                              Awaiting counter confirmation
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[120px] whitespace-nowrap">
                        {record.receiptId ? (
                          <Link
                            href="/dashboard/receipts"
                            className="inline-flex items-center gap-1 rounded bg-muted/60 px-2 py-0.5 font-mono text-xs text-foreground hover:bg-muted"
                          >
                            <ReceiptIcon className="size-3 text-muted-foreground" />
                            <span>{record.receiptId}</span>
                          </Link>
                        ) : (
                          <span className="font-mono text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-[140px] whitespace-nowrap tabular-nums text-xs text-muted-foreground">
                        {formatDate(record.createdAt)}
                      </TableCell>
                      <TableCell className="w-16 min-w-[64px] whitespace-nowrap text-right sticky right-0 z-10 bg-card/95 backdrop-blur-xs border-l border-border/40 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.04)]">
                        <div className="flex items-center justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger
                              type="button"
                              className={cn(
                                buttonVariants({ variant: "ghost", size: "icon-sm" }),
                                "size-8 text-muted-foreground hover:text-foreground cursor-pointer focus-visible:ring-2"
                              )}
                              aria-label={`Actions for ${record.studentName}`}
                              title="Actions"
                            >
                              <EllipsisIcon className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" side="bottom" className="w-52">
                              {/* 1. Send Reminder */}
                              <DropdownMenuItem onClick={() => setReminderRecord(record)}>
                                <BellRingIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                                <span>Send Reminder</span>
                              </DropdownMenuItem>

                              {/* 2. Direct Collect button */}
                              {can("data:write") && (
                                <DropdownMenuItem onClick={() => setCollectRecord(record)}>
                                  <QrCodeIcon className="size-4 text-primary" />
                                  <span>Collect Payment</span>
                                </DropdownMenuItem>
                              )}

                              {/* 3. Payment History */}
                              <DropdownMenuItem onClick={() => openHistory(record)}>
                                <Clock3Icon className="size-4 text-muted-foreground" />
                                <span>Payment History</span>
                              </DropdownMenuItem>

                              {/* 4. Open Checkout URL */}
                              {paymentUrl && (
                                <DropdownMenuItem onClick={() => window.open(paymentUrl, "_blank")}>
                                  <ExternalLinkIcon className="size-4 text-muted-foreground" />
                                  <span>Open Checkout URL</span>
                                </DropdownMenuItem>
                              )}

                              {/* 5. View Receipt */}
                              {record.receiptId && (
                                <DropdownMenuItem render={<Link href="/dashboard/receipts" />}>
                                  <ReceiptIcon className="size-4 text-muted-foreground" />
                                  <span>View Receipt</span>
                                </DropdownMenuItem>
                              )}

                              {/* 6. Copy Reference ID */}
                              <DropdownMenuItem
                                onClick={() => void copyToClipboard(record.orderId, record.orderId)}
                              >
                                <CopyIcon className="size-4 text-muted-foreground" />
                                <span>Copy Reference ID</span>
                              </DropdownMenuItem>

                              {/* 7. Cashier counter confirmation */}
                              {can("data:write") &&
                                record.source === "gateway" &&
                                isCounter &&
                                !TERMINAL.has(record.status) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      disabled={isBusy}
                                      onClick={() => void handleConfirm(record)}
                                    >
                                      <CheckIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
                                      <span>Confirm Cash Payment</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      disabled={isBusy}
                                      onClick={() => void handleDecline(record)}
                                    >
                                      <XIcon className="size-4 text-destructive" />
                                      <span>Decline Payment</span>
                                    </DropdownMenuItem>
                                  </>
                                )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
        {unifiedRecords.length > 0 && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
            <span>
              {unifiedRecords.length} total records across {students.length} students
            </span>
            <span className="hidden sm:block">
              Payments, receipts, and interactive WhatsApp reminders update in real-time.
            </span>
          </div>
        )}
      </div>

      {/* Single Student Reminder Dialog with interactive-button-bubble (ONLY Pay Now button) */}
      <FeeReminderDialog
        record={reminderRecord}
        open={Boolean(reminderRecord)}
        onOpenChange={(open) => {
          if (!open) setReminderRecord(null)
        }}
        companyName={companyName}
        workspacePaymentUrl={workspacePaymentUrl}
      />

      {/* Bulk Reminders Dialog */}
      <BulkReminderDialog
        records={unifiedRecords}
        open={bulkReminderOpen}
        onOpenChange={setBulkReminderOpen}
        onSelectRecord={(rec) => setReminderRecord(rec)}
      />

      {/* Payment Timeline Dialog */}
      <PaymentTimeline
        order={timelineOrder}
        open={!!timelineOrder}
        onOpenChange={(open) => {
          if (!open) setTimelineOrder(null)
        }}
      />

      {/* Collect Payment Dialog triggered from 3-dots action menu */}
      {collectRecord && (
        <PayWithGateway
          open={Boolean(collectRecord)}
          onOpenChange={(next) => {
            if (!next) setCollectRecord(null)
          }}
          studentId={collectRecord.studentId}
          studentName={collectRecord.studentName}
          amount={collectRecord.amount}
          onCompleted={() => {
            setCollectRecord(null)
            reload()
          }}
        />
      )}
    </DashboardShell>
  )
}
