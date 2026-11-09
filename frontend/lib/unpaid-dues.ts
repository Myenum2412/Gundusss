/**
 * Outstanding ("unpaid") money for the dashboard.
 *
 * The rule mirrors the Payments page: a student is either settled or owes one
 * fee. Several open gateway checkouts can exist for the same student (every
 * reminder run used to create a new one), but they are alternative payment
 * links for the *same* due — they must never be added together. A stale
 * checkout for a student who has already paid is not extra outstanding money
 * either; it is just an abandoned payment attempt.
 */

export const PAID_RECEIPT_STATUSES = new Set(["paid", "success", "settled"])

/** Dead checkout attempts — a due never comes back from these states. */
export const UNPAID_BUT_TERMINAL = new Set([
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "CANCELED",
  "SUSPICIOUS",
  "BLOCKED",
  "REFUNDED",
])

export interface UnpaidStudent {
  studentId?: string
  studentName?: string
  joiningDate?: string
}

export interface UnpaidReceipt {
  studentId?: string
  studentName?: string
  amount?: string | number
  status?: string
  paymentDate?: string
}

export interface UnpaidOrder {
  studentId?: string
  studentName?: string
  amount?: string | number
  status?: string
  gatewayStatus?: string
  receiptId?: string | null
  createdAt?: string
}

export interface UnpaidDue {
  /** Lower-cased studentId (preferred) or studentName. */
  key: string
  /** "YYYY-MM" bucket for the monthly chart. */
  month: string
  amount: number
}

const MONTH_RE = /^\d{4}-\d{2}$/

function identity(value: { studentId?: string; studentName?: string }): string {
  return (value.studentId || value.studentName || "").trim().toLowerCase()
}

export function isPaidReceipt(receipt: UnpaidReceipt): boolean {
  return PAID_RECEIPT_STATUSES.has((receipt.status || "").trim().toLowerCase())
}

export function isPaidOrder(order: UnpaidOrder): boolean {
  const st = (order.status || "").trim().toUpperCase()
  return (
    st === "SUCCESS" ||
    st === "PAID" ||
    st === "COMPLETED" ||
    (order.gatewayStatus || "").trim().toUpperCase() === "SUCCESS" ||
    Boolean(order.receiptId)
  )
}

/**
 * @param resolveFee Resolves the fee a student owes (fee structure / group).
 */
export function calculateUnpaidDues({
  students,
  receipts,
  orders,
  resolveFee,
}: {
  students: UnpaidStudent[]
  receipts: UnpaidReceipt[]
  orders: UnpaidOrder[]
  resolveFee: (student: UnpaidStudent) => string | number
}): UnpaidDue[] {
  const currentMonth = new Date().toISOString().slice(0, 7)

  // A paid receipt settles the student. Both identities are tracked because
  // receipts and orders do not always carry the same field.
  const settled = new Set<string>()
  for (const receipt of receipts) {
    if (!isPaidReceipt(receipt)) continue
    if (receipt.studentId) settled.add(receipt.studentId.trim().toLowerCase())
    if (receipt.studentName) settled.add(receipt.studentName.trim().toLowerCase())
  }

  // One due per student: keep only the newest payable checkout. Summing every
  // INITIATED order was the cause of the phantom ₹40,000 on the dashboard.
  const orderDues = new Map<string, UnpaidDue & { createdAt: string }>()
  for (const order of orders) {
    if (isPaidOrder(order)) continue
    const status = (order.status || "").trim().toUpperCase()
    if (!status || UNPAID_BUT_TERMINAL.has(status)) continue

    const amount = Number.parseFloat(String(order.amount)) || 0
    if (amount <= 0) continue

    const createdAt = order.createdAt || ""
    const month = createdAt.slice(0, 7)
    if (!MONTH_RE.test(month)) continue

    const key = identity(order)
    if (!key || settled.has(key)) continue

    const existing = orderDues.get(key)
    if (!existing || createdAt >= existing.createdAt) {
      orderDues.set(key, { key, month, amount, createdAt })
    }
  }

  const dues = new Map<string, UnpaidDue>()

  // Enrolled students without a paid receipt owe their resolved fee. Any open
  // checkout they have is a link to pay that same fee, so the fee stands and
  // the checkout is not added on top of it.
  for (const student of students) {
    const key = identity(student)
    if (!key || settled.has(key)) continue

    const amount = Number.parseFloat(String(resolveFee(student))) || 0
    if (amount <= 0) continue

    const month = (student.joiningDate || "").slice(0, 7)
    dues.set(key, {
      key,
      month: MONTH_RE.test(month) ? month : currentMonth,
      amount,
    })
  }

  // Payable orders for students outside the roster (walk-ins, deleted
  // students, public checkout links) count once each.
  for (const [key, due] of orderDues) {
    if (dues.has(key)) continue
    dues.set(key, due)
  }

  return [...dues.values()]
}
