import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { orderId: string } }
) {
  const orderId = params?.orderId?.trim() || ""
  if (!orderId) {
    return NextResponse.json({ error: "Missing order ID" }, { status: 400 })
  }

  // 1. Try local Fastify backend first
  const backendBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:4000"

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 1200)
    const backendRes = await fetch(
      `${backendBase.replace(/\/+$/, "")}/api/public/payments/${encodeURIComponent(orderId)}`,
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
  } catch {
    // Backend unreachable
  }

  // 2. Direct fallback status response
  return NextResponse.json(
    {
      data: {
        orderId,
        status: "CREATED",
        gatewayStatus: "PENDING",
        method: "UPI",
      },
    },
    { headers: { "Access-Control-Allow-Origin": "*" } }
  )
}
