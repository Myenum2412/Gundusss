import { NextRequest, NextResponse } from "next/server"
import { backendBaseUrl } from "@/lib/backend-base"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const orderId = params?.orderId?.trim() || ""
  if (!orderId) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 })
  }

  // The backend owns the payment order. Never invent a status when it is
  // unreachable — a fake "CREATED" response would make the payer think the
  // order exists when nothing was recorded in Appwrite.
  const backendBase = backendBaseUrl()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6_000)
    const backendRes = await fetch(
      `${backendBase}/api/public/payments/${encodeURIComponent(orderId)}`,
      {
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      }
    )
    clearTimeout(timer)

    if (backendRes.ok) {
      const data = await backendRes.json()
      return NextResponse.json(data, {
        headers: { "Access-Control-Allow-Origin": "*" },
      })
    }

    if (backendRes.status === 404) {
      return NextResponse.json(
        { error: "Payment order not found" },
        { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
      )
    }
  } catch {
    // Backend unreachable — fall through to the 502 response below.
  }

  return NextResponse.json(
    { error: "The payment service is unreachable right now. Please retry." },
    { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
  )
}
