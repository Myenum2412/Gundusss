import { isGatewayCheckoutUrl } from "./payments"

/**
 * A reminder record only needs the fields used to render the WhatsApp body.
 * Keeping this structural (instead of importing the dashboard's view model)
 * makes the message builder usable outside a React component and testable.
 */
export interface ReminderRecord {
  orderId: string
  studentId?: string
  studentName: string
  course?: string
  group?: string
  amount: string | number
  status?: string
  receiptId?: string | null
}

export interface ReminderMessageInput {
  record: ReminderRecord
  companyName: string
  /**
   * The checkout URL minted for *this* reminder. Callers must pass the freshly
   * created gateway URL; the record's cached paymentUrl is deliberately ignored
   * because it may point at a cancelled or expired session.
   */
  paymentUrl: string
}

function normalizeStatus(status?: string | null): string {
  if (!status) return ""
  const value = status.trim().toUpperCase()
  return value === "CANCELED" ? "CANCELLED" : value
}

function formatAmount(value: string | number): string {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return String(value)
  return `₹ ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function getStudentSpecificPaymentUrl(
  basePayUrl: string,
  studentId?: string
): string {
  if (!basePayUrl) return ""
  if (!studentId || studentId === "—") return basePayUrl
  if (basePayUrl.includes("student=")) return basePayUrl
  const separator = basePayUrl.includes("?") ? "&" : "?"
  return `${basePayUrl}${separator}student=${encodeURIComponent(studentId)}`
}

/**
 * Reminder links are always minted fresh. A local order can still say
 * INITIATED while its gateway session is already CANCELLED (for example when a
 * webhook was missed), so neither the local status nor the cached paymentUrl is
 * authoritative enough to reuse.
 */
export type ReminderCheckoutDecision =
  | { kind: "acknowledgment" }
  | { kind: "fresh-checkout" }

export function decideReminderCheckout(input: {
  isPaid: boolean
  localStatus?: string | null
  gatewayStatus?: string | null
  cachedPaymentUrl?: string | null
}): ReminderCheckoutDecision {
  if (input.isPaid) return { kind: "acknowledgment" }
  return { kind: "fresh-checkout" }
}

export function generateReminderText({
  record,
  companyName,
  paymentUrl,
}: ReminderMessageInput): string {
  const organization = companyName ? companyName.trim() : "Institute Office"
  const isPaid = normalizeStatus(record.status) === "SUCCESS"

  if (isPaid) {
    return [
      `*Payment Acknowledgment - ${organization}*`,
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
    ].join("\n")
  }

  // Only a real gateway checkout URL may be sent. Never fall back to
  // record.paymentUrl: that cached link is what caused cancelled sessions to be
  // resent in reminders.
  const base = paymentUrl.trim()
  const payableUrl = isGatewayCheckoutUrl(base)
    ? getStudentSpecificPaymentUrl(base, record.studentId)
    : ""

  const lines = [
    `*Fee Payment Reminder - ${organization}*`,
    ``,
    `Dear Parent / Student ${record.studentName},`,
    `This is a gentle reminder regarding the pending fee payment for *${record.course || "General Course"}* (${record.group || "Batch"}).`,
    ``,
    `• *Student ID:* ${record.studentId || "—"}`,
    `• *Amount Due:* ${formatAmount(record.amount)}`,
    `• *Reference ID:* ${record.orderId}`,
  ]

  if (payableUrl) {
    lines.push(``)
    lines.push(`👉 *Click to Pay Now:*`)
    lines.push(`${payableUrl}`)
  }

  lines.push(``)
  lines.push(
    `You can pay securely with any UPI app (GPay, PhonePe, Paytm) or at the counter. If already paid, please ignore this message.`
  )
  lines.push(`Thank you,`)
  lines.push(`${organization}`)

  return lines.join("\n")
}
