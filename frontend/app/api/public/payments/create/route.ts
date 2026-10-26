import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const amount = Number(body?.amount)
    if (!body?.slug || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "Invalid payment parameters: slug and a positive amount are required" },
        { status: 400, headers: CORS_HEADERS }
      )
    }

    const backendBase =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:4000"

    let backendRes: Response
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10_000)
      try {
        backendRes = await fetch(
          `${backendBase.replace(/\/+$/, "")}/api/public/payments/create`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          }
        )
      } finally {
        clearTimeout(timer)
      }
    } catch {
      return NextResponse.json(
        {
          error:
            "The payment service is unreachable right now. Please retry in a moment or pay at the counter.",
        },
        { status: 502, headers: CORS_HEADERS }
      )
    }

    const json = (await backendRes.json().catch(() => ({}))) as {
      error?: string
      message?: string
      details?: unknown
      data?: unknown
    }

    if (!backendRes.ok) {
      return NextResponse.json(
        {
          error:
            json.error ??
            json.message ??
            `Payment checkout failed (HTTP ${backendRes.status})`,
          details: json.details,
        },
        { status: backendRes.status, headers: CORS_HEADERS }
      )
    }

    // No local fallback order is created here. A fake order can neither be
    // verified nor reconciled, and it previously exposed a hardcoded personal
    // UPI ID as the payee when the backend was unavailable.
    return NextResponse.json(json, { headers: CORS_HEADERS })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create payment order" },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}
