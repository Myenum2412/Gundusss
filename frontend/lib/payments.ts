import { API_BASE, apiFetch } from "./api-base"

const BASE = API_BASE

export type PaymentMethod = "UPI" | "CASH_COUNTER" | "CARD_COUNTER"

export interface PaymentEvent {
  id: number | string
  orderId: string
  status: string
  gatewayStatus: string
  method: string
  source: string
  message: string
  createdAt: string
}

export interface PaymentOrder {
  orderId: string
  paymentId: string | null
  status: string
  gatewayStatus: string
  method: string
  utr: string
  upiId?: string
  payerVpa?: string
  institutionName?: string
  amount: string
  studentId: string
  studentName: string
  feeId: number | null
  checkoutUrl: string
  paymentUrl?: string
  receiptId: string | null
  completedAt?: string
  createdAt: string
  updatedAt: string
  events?: PaymentEvent[]
}

export interface CreatePaymentInput {
  studentId?: string
  studentName: string
  amount: number | string
  feeId?: number
  email?: string
  phone?: string
  description?: string
  method?: PaymentMethod
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  CASH_COUNTER: "Cash at counter",
  CARD_COUNTER: "Card at counter",
}

export const PAYMENT_METHOD_NOTES: Record<string, string> = {
  UPI: "Pay now with any UPI app using a single-use QR.",
  CASH_COUNTER: "Create a counter pass and collect cash at the office.",
  CARD_COUNTER: "Collect the card payment on the office POS terminal.",
}

export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? (method || "UPI")
}

export interface PaymentGatewayInfo {
  connected: boolean
  synced?: boolean
  upiId?: string
  payeeName?: string
  error?: string
}

export interface PaymentSettings {
  upiId: string
  payeeName: string
  qrCodeDataUrl: string
  generatedQrDataUrl: string
  updatedAt: string | null
  gateway: PaymentGatewayInfo
}

export interface PaymentSettingsInput {
  upiId: string
  payeeName: string
  qrCodeDataUrl?: string
}

const RETRYABLE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])
const RETRY_DELAYS_MS = [400, 900, 1_600]

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase()
  // Retrying a GET is safe and rides out a backend that is still booting.
  // Writes are attempted once so a lost response can never duplicate an order.
  const attempts = RETRYABLE_METHODS.has(method) ? RETRY_DELAYS_MS.length + 1 : 1

  let res: Response | undefined
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      res = await apiFetch(path, init)
      break
    } catch {
      if (attempt === attempts - 1) break
      await delay(RETRY_DELAYS_MS[attempt])
    }
  }

  if (!res) {
    throw new Error(
      `Cannot reach the payments backend at ${BASE}. Run "dev.bat" (or "npm run dev") and retry.`
    )
  }

  const json = (await res.json().catch(() => ({}))) as {
    data?: T
    error?: string
    message?: string
  }

  if (!res.ok) {
    throw new Error(
      json.error ?? json.message ?? `Payment request failed (HTTP ${res.status})`
    )
  }
  return json.data as T
}

export function createPayment(input: CreatePaymentInput): Promise<PaymentOrder> {
  return request<PaymentOrder>("/api/payments/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method: "UPI", ...input }),
  })
}

const CHECKOUT_PATH_RE = /\/checkout\/[A-Za-z0-9_-]+/

/**
 * A real gateway checkout URL, for example
 * https://pay.myenum.in/checkout/3499aabc-0fd4-4dc5-8feb-b81a7abc59ca
 */
export function isGatewayCheckoutUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      CHECKOUT_PATH_RE.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

/**
 * Open a real YOUPI PG checkout for a student and return its payable URL.
 * Throws when the gateway does not hand back a checkout link so callers never
 * send a hand-built or expired workspace URL in a reminder.
 */
export async function createStudentCheckoutUrl(input: {
  studentId?: string
  studentName: string
  amount: number | string
  feeId?: number
  phone?: string
  email?: string
  description?: string
}): Promise<string> {
  const order = await createPayment({ ...input, method: "UPI" })
  const raw = (order.paymentUrl || order.checkoutUrl || "").trim()
  if (!isGatewayCheckoutUrl(raw)) {
    throw new Error(
      "The payment gateway did not return a usable checkout link. Check Payments → UPI setup and retry."
    )
  }
  if (!input.studentId) return raw
  const sep = raw.includes("?") ? "&" : "?"
  return `${raw}${sep}student=${encodeURIComponent(input.studentId)}`
}

/** @deprecated Use createPayment with an explicit method. */
export function createUpiPayment(input: CreatePaymentInput): Promise<PaymentOrder> {
  return createPayment({ ...input, method: "UPI" })
}

export function confirmCounterPayment(
  id: string,
  operatorId?: string
): Promise<PaymentOrder> {
  return request<PaymentOrder>(`/api/payments/${encodeURIComponent(id)}/counter-confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operatorId }),
  })
}

export function confirmPayment(
  id: string,
  options?: {
    operatorId?: string
    utr?: string
    method?: string
    amount?: number | string
    notes?: string
  }
): Promise<PaymentOrder> {
  return request<PaymentOrder>(`/api/payments/${encodeURIComponent(id)}/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options ?? {}),
  })
}

export function declineCounterPayment(
  id: string,
  reason?: string,
  operatorId?: string
): Promise<PaymentOrder> {
  return request<PaymentOrder>(`/api/payments/${encodeURIComponent(id)}/counter-decline`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason, operatorId }),
  })
}

export async function listPayments(): Promise<PaymentOrder[]> {
  const data = await request<PaymentOrder[]>("/api/payments")
  return data ?? []
}

export function getPayment(id: string): Promise<PaymentOrder> {
  return request<PaymentOrder>(`/api/payments/${encodeURIComponent(id)}`)
}

export function getPaymentSettings(): Promise<PaymentSettings> {
  return request<PaymentSettings>("/api/payments/settings")
}

export function savePaymentSettings(
  input: PaymentSettingsInput
): Promise<PaymentSettings> {
  return request<PaymentSettings>("/api/payments/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
}

export function getPreviewQr(
  upiId: string,
  payeeName: string,
  amount?: number | string
): Promise<{ qrDataUrl: string }> {
  const params = new URLSearchParams({ upiId, payeeName })
  if (amount !== undefined && amount !== "") params.set("amount", String(amount))
  return request<{ qrDataUrl: string }>(
    `/api/payments/settings/qr?${params.toString()}`
  )
}

export function syncPaymentSettings(): Promise<PaymentSettings> {
  return request<PaymentSettings>("/api/payments/settings/sync", {
    method: "POST",
  })
}

export interface PublicStudentOption {
  studentId: string
  studentName: string
  group: string
  course: string
  phone: string
  email: string
  feeAmount?: string
}

export interface PublicOrganizationProfile {
  profileId: string
  name: string
  ownerName: string
  paymentUrl: string
  upiId: string
  payeeName: string
  qrCodeDataUrl: string
  logoUrl: string
  phone: string
  email: string
  description: string
  students?: PublicStudentOption[]
}

export async function getPublicProfile(slug: string): Promise<PublicOrganizationProfile> {
  const urls = [
    `/api/public/profile/${encodeURIComponent(slug)}`,
    `${BASE}/api/public/profile/${encodeURIComponent(slug)}`,
  ]

  let lastError: any = null
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const json = (await res.json()) as { data: PublicOrganizationProfile }
        if (json?.data) return json.data
      } else {
        const err = await res.json().catch(() => ({}))
        lastError = new Error(err.error || `Organization not found (HTTP ${res.status})`)
      }
    } catch (e) {
      lastError = e
    }
  }

  throw lastError || new Error("Organization not found")
}

export async function getPublicStudents(slug: string): Promise<PublicStudentOption[]> {
  const urls = [
    `/api/public/students/${encodeURIComponent(slug)}`,
    `${BASE}/api/public/students/${encodeURIComponent(slug)}`,
  ]

  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const json = (await res.json()) as { data: PublicStudentOption[] }
        if (json?.data?.length) return json.data
      }
    } catch {
      // try next
    }
  }

  return []
}

export async function createPublicPayment(input: {
  slug: string
  studentName: string
  studentId?: string
  amount: number | string
  email?: string
  phone?: string
  description?: string
  method?: string
}): Promise<PaymentOrder> {
  const urls = Array.from(
    new Set([`/api/public/payments/create`, `${BASE}/api/public/payments/create`])
  )

  let lastError: any = null
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (res.ok) {
        const json = (await res.json()) as { data: PaymentOrder }
        if (json?.data) return json.data
        lastError = new Error("Payment checkout returned an empty response.")
      } else {
        const err = await res.json().catch(() => ({}))
        // Any HTTP response is a real answer (validation, missing UPI setup,
        // method disabled, upstream failure). Retrying another URL could
        // create a second order, so surface it immediately.
        throw new Error(
          err.error || `Payment checkout failed (HTTP ${res.status})`
        )
      }
    } catch (e) {
      if (e instanceof Error && !(e instanceof TypeError)) throw e
      lastError = e
    }
  }

  // Never invent an order here. A fabricated order cannot be verified or
  // reconciled, and its hardcoded UPI fallback routed real payments to an
  // unrelated personal VPA when the backend was down.
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not create the payment order. Please retry in a moment.")
}

export async function getPublicPaymentStatus(orderId: string): Promise<PaymentOrder> {
  const urls = Array.from(
    new Set([
      `/api/public/payments/${encodeURIComponent(orderId)}`,
      `${BASE}/api/public/payments/${encodeURIComponent(orderId)}`,
    ])
  )

  let lastError: unknown = null
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" })
      if (res.ok) {
        const json = (await res.json()) as { data: PaymentOrder }
        if (json?.data) return json.data
      } else {
        const err = await res.json().catch(() => ({}))
        lastError = new Error(
          err.error || `Payment status check failed (HTTP ${res.status})`
        )
      }
    } catch (e) {
      lastError = e
    }
  }

  // A synthetic "CREATED" response would hide a broken status feed and could
  // make the page look like a real pending payment. Fail loudly instead.
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not verify the payment status. Please retry in a moment.")
}

