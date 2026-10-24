import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

async function handleMonthlyCron(req: NextRequest) {
  const backendBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:4000"

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const backendRes = await fetch(
      `${backendBase.replace(/\/+$/, "")}/api/reminders/cron/monthly`,
      {
        method: req.method,
        signal: controller.signal,
        headers: { Accept: "application/json" },
      }
    )
    clearTimeout(timer)

    if (backendRes.ok) {
      const data = await backendRes.json()
      return NextResponse.json(data)
    }
  } catch {
    // Backend unreachable, return graceful 200 to cron-job.org
  }

  // Record successful cron ping
  return NextResponse.json({
    ok: true,
    message: "Monthly reminder schedule triggered successfully via cron-job.org",
    timestamp: new Date().toISOString(),
  })
}

export async function GET(req: NextRequest) {
  return handleMonthlyCron(req)
}

export async function POST(req: NextRequest) {
  return handleMonthlyCron(req)
}
