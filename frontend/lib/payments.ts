import { API_BASE } from "./api-base"

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
  amount: string
  studentId: string
  studentName: string
  feeId: number | null
  checkoutUrl: string
  receiptId: string | null
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
  CARD_COUNTER: "Create a counter pass and collect card payment at the office.",
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
      res = await fetch(`${BASE}${path}`, {
        cache: "no-store",
        ...init,
      })
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
