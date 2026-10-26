import { createHash, randomBytes } from "node:crypto"
import { isUsableUpiVpa } from "./upi"

const ENDPOINT = (
  process.env.APPWRITE_ENDPOINT ?? "https://nyc.cloud.appwrite.io/v1"
).replace(/\/+$/, "")
const PROJECT_ID = (process.env.APPWRITE_PROJECT_ID ?? "6adaf4be003ae5c9e622").trim()
const API_KEY = (
  process.env.APPWRITE_API_KEY ??
  "standard_7e06dff20968d185b6d6aa30d715d3bd629a7e2a02dfbfa7c5d7f125e1a17dca658b3d250bca4139c2dba291ce772b32152be34f093c079b2e7e0b2ea929c672cdc322c0544fb95d9d49f6599fd81af57e176e1d0d1449ca051ecf7300b865fb09c530d546a8c40bbf31b1e3bd7d6972d7fa1f760fd559fcdf833e1331332d5b"
).trim()
const DATABASE_ID = (process.env.APPWRITE_DATABASE_ID ?? "fees").trim()

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
  paymentUrl?: string
  receiptId: string | null
  createdAt: string
  updatedAt: string
}

export function slugify(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

function rowId(collection: string, entityId: string): string {
  return createHash("sha256")
    .update(`${collection}\u0000${entityId}`)
    .digest("hex")
    .slice(0, 32)
}

async function appwriteFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${ENDPOINT}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": PROJECT_ID,
      "X-Appwrite-Key": API_KEY,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(8000),
  })
}

export async function fetchPublicProfileFromAppwrite(
  slug: string
): Promise<PublicOrganizationProfile | null> {
  const clean = slug.trim().toLowerCase()
  if (!clean) return null

  try {
    // 1. Fetch profiles table
    const profRes = await appwriteFetch(
      `/tablesdb/${DATABASE_ID}/tables/profiles/rows?queries[]=${encodeURIComponent(
        JSON.stringify({ method: "limit", values: [100] })
      )}`
    )

    let matchedProfile: any = null

    if (profRes.ok) {
      const profJson = await profRes.json()
      const rows = profJson.rows ?? []
      for (const row of rows) {
        try {
          const data = JSON.parse(row.payload)
          if (
            data.profileId?.toLowerCase() === clean ||
            slugify(data.name || "") === clean ||
            data.name?.trim().toLowerCase() === clean
          ) {
            matchedProfile = data
            break
          }
        } catch {
          // ignore parse error
        }
      }
    }

    if (!matchedProfile) {
      return null
    }

    const profileId = matchedProfile.profileId

    // 2. Fetch business profile for metadata
    let biz: any = null
    try {
      const bizRes = await appwriteFetch(
        `/tablesdb/${DATABASE_ID}/tables/business_profiles/rows/${rowId(
          "business_profiles",
          `${profileId}:1`
        )}`
      )
      if (bizRes.ok) {
        const json = await bizRes.json()
        biz = JSON.parse(json.payload)?.profile
      }
    } catch {
      // ignore
    }

    // 3. Fetch payment settings
    let upiId = ""
    let payeeName = matchedProfile.name
    let qrCodeDataUrl = ""
    try {
      const setRes = await appwriteFetch(
        `/tablesdb/${DATABASE_ID}/tables/payment_settings/rows/${rowId(
          "payment_settings",
          `${profileId}:1`
        )}`
      )
      if (setRes.ok) {
        const json = await setRes.json()
        const s = JSON.parse(json.payload)
        upiId = s.upi_id || ""
        payeeName = s.payee_name || matchedProfile.name
        qrCodeDataUrl = s.qr_code_data_url || ""
      }
    } catch {
      // ignore
    }

    // 4. Fetch students for this profile
    const students: PublicStudentOption[] = []
    try {
      const stuRes = await appwriteFetch(
        `/tablesdb/${DATABASE_ID}/tables/students/rows?queries[]=${encodeURIComponent(
          JSON.stringify({ method: "limit", values: [100] })
        )}`
      )
      if (stuRes.ok) {
        const json = await stuRes.json()
        const rows = json.rows ?? []
        for (const r of rows) {
          if (r.entityId?.startsWith(`${profileId}:`)) {
            try {
              const s = JSON.parse(r.payload)
              if ((s.status || "Active").toLowerCase() !== "inactive") {
                students.push({
                  studentId: s.studentId,
                  studentName: s.studentName,
                  group: s.group || "",
                  course: s.course || "",
                  phone: s.phone || "",
                  email: s.email || "",
                  feeAmount: s.feeAmount || "5000",
                })
              }
            } catch {
              // ignore
            }
          }
        }
      }
    } catch {
      // ignore
    }

    return {
      profileId,
      name: matchedProfile.name,
      ownerName: matchedProfile.ownerName || matchedProfile.name,
      paymentUrl: matchedProfile.paymentUrl || `https://myfees.myenum.in/${slugify(matchedProfile.name)}`,
      upiId,
      payeeName,
      qrCodeDataUrl,
      logoUrl: biz?.media?.logoUrl || "",
      phone: biz?.phone || "",
      email: biz?.email || matchedProfile.ownerEmail || "",
      description: biz?.description || "",
      students,
    }
  } catch {
    return null
  }
}

export async function createPublicOrderInAppwrite(input: {
  slug: string
  studentName: string
  studentId?: string
  amount: number | string
  email?: string
  phone?: string
  description?: string
}): Promise<PaymentOrder> {
  const profile = await fetchPublicProfileFromAppwrite(input.slug)
  if (!profile?.profileId) {
    throw new Error("Organization not found for this payment page.")
  }
  if (!isUsableUpiVpa(profile.upiId)) {
    throw new Error(
      "Online UPI is not configured for this institution. Ask the office to save a merchant UPI ID."
    )
  }

  const profileId = profile.profileId
  const payeeName = profile.payeeName || profile.name
  const upiId = profile.upiId.trim()

  const orderId = `ORD-${Date.now()}-${randomBytes(3).toString("hex").toUpperCase()}`
  const numAmount = Number(input.amount).toFixed(2)
  const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(
    payeeName
  )}&am=${encodeURIComponent(numAmount)}&cu=INR&tn=${encodeURIComponent(
    `Fee-${orderId}`
  )}`

  const now = new Date().toISOString()
  const order: PaymentOrder = {
    orderId,
    paymentId: null,
    status: "CREATED",
    gatewayStatus: "PENDING",
    method: "UPI",
    utr: "",
    amount: numAmount,
    studentId: input.studentId || "STU-001",
    studentName: input.studentName,
    feeId: null,
    checkoutUrl: upiUrl,
    paymentUrl: upiUrl,
    receiptId: null,
    createdAt: now,
    updatedAt: now,
  }

  try {
    const entityId = `${profileId}:${orderId}`
    await appwriteFetch(
      `/tablesdb/${DATABASE_ID}/tables/payment_orders/rows/${rowId(
        "payment_orders",
        entityId
      )}`,
      {
        method: "PUT",
        body: JSON.stringify({
          data: {
            entityId,
            payload: JSON.stringify(order),
            createdAt: now,
            updatedAt: now,
          },
        }),
      }
    )
  } catch {
    // If table write fails, proceed with generated order
  }

  return order
}
