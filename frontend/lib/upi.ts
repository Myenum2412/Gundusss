/**
 * UPI URI helpers shared by the public payment page.
 *
 * UPI deep links are not interchangeable with `upi://` URIs. Each app uses its
 * own scheme but expects the same query string (`pa`, `pn`, `am`, `cu`, `tn`).
 * Replacing the `upi:` prefix on a full URI (the old approach here) produced
 * `tez://upi/pay?//pay?pa=...`, which no app can parse.
 */

export const UPI_VPA_RE = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z0-9.\-_]{2,64}$/

/**
 * Handles the gateway seeds into an empty database. They are valid-looking but
 * cannot receive money, so they must never be shown to a payer.
 */
const PLACEHOLDER_VPAS = new Set([
  "merchant@upi",
  "demo@upi",
  "test@upi",
  "sample@upi",
  "example@upi",
  "yourupi@bank",
  "upi@upi",
])

export type UpiApp = "generic" | "gpay" | "phonepe" | "paytm" | "bhim"

const APP_SCHEMES: Record<Exclude<UpiApp, "generic">, string> = {
  gpay: "tez://upi/pay?",
  phonepe: "phonepe://pay?",
  paytm: "paytmmp://pay?",
  bhim: "upi://pay?",
}

export function isValidUpiVpa(value: unknown): value is string {
  return typeof value === "string" && UPI_VPA_RE.test(value.trim())
}

export function isPlaceholderUpiVpa(value: unknown): boolean {
  if (typeof value !== "string") return false
  return PLACEHOLDER_VPAS.has(value.trim().toLowerCase())
}

/** A VPA is usable only when it is syntactically valid and not a seed value. */
export function isUsableUpiVpa(value: unknown): value is string {
  return isValidUpiVpa(value) && !isPlaceholderUpiVpa(value)
}

export interface UpiPaymentParams {
  vpa: string
  payeeName: string
  amount?: number | string
  note?: string
}

function normalizeAmount(amount: number | string | undefined): string {
  if (amount === undefined || amount === null || amount === "") return ""
  const n = Number(amount)
  if (!Number.isFinite(n) || n <= 0) return ""
  return n.toFixed(2)
}

function buildQuery({ vpa, payeeName, amount, note }: UpiPaymentParams): string {
  const params = new URLSearchParams()
  params.set("pa", vpa.trim())
  params.set("pn", (payeeName || "Merchant").trim())
  const am = normalizeAmount(amount)
  if (am) params.set("am", am)
  params.set("cu", "INR")
  if (note && note.trim()) params.set("tn", note.trim().slice(0, 100))
  // URLSearchParams renders spaces as "+"; UPI apps expect percent-encoding.
  return params.toString().replace(/\+/g, "%20")
}

/** Canonical NPCI URI understood by every UPI app. */
export function buildUpiPaymentUri(input: UpiPaymentParams): string {
  if (!isUsableUpiVpa(input.vpa)) {
    throw new Error("A valid merchant UPI ID is required to build a payment link.")
  }
  return `upi://pay?${buildQuery(input)}`
}

/**
 * Builds an app-specific launcher URL from the same validated parameters.
 * GPay (`tez`), PhonePe and Paytm each expose `/pay?` on their own scheme.
 */
export function buildUpiAppUri(app: UpiApp, input: UpiPaymentParams): string {
  if (app === "generic" || app === "bhim") {
    return buildUpiPaymentUri(input)
  }
  if (!isUsableUpiVpa(input.vpa)) {
    throw new Error("A valid merchant UPI ID is required to build a payment link.")
  }
  return `${APP_SCHEMES[app]}${buildQuery(input)}`
}

/** Converts an already-built canonical URI into an app launcher safely. */
export function toUpiAppUri(upiUri: string, app: UpiApp): string {
  if (app === "generic" || app === "bhim") return upiUri
  const queryIndex = upiUri.indexOf("?")
  const query = queryIndex >= 0 ? upiUri.slice(queryIndex + 1) : ""
  return `${APP_SCHEMES[app]}${query}`
}
