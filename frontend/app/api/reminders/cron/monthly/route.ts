import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * webhook hit by cron-job.org on the 1st of every month (09:00 IST).
 *
 * This proxies the request to the Fastify backend, which actually runs the
 * reminder sweep. Failures MUST be reported as non-200 responses here —
 * cron-job.org records the response status and emails the account owner on
 * failure, so swallowing an error and returning a fake 200 would silently skip
 * a month of fee reminders.
 */
async function handleMonthlyCron(req: NextRequest) {
  const backendBase =
    process.env.BACKEND_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://127.0.0.1:4000"

  if (!process.env.BACKEND_INTERNAL_URL && !process.env.NEXT_PUBLIC_API_URL) {
    console.error(
      "[reminders/cron/monthly] BACKEND_INTERNAL_URL or NEXT_PUBLIC_API_URL must be set in the deployment environment (127.0.0.1 does not resolve to the backend in production)"
    )
    return NextResponse.json(
      {
        error: "Backend URL not configured",
        message:
          "Set BACKEND_LOCAL_URL or CRON_PROXY_URL in the deployment environment",
      },
      { status: 500 }
    )
  }

  const url = `${backendBase.replace(/\/+$/, "")}/api/reminders/cron/monthly`

  try {
    // WhatsApp sends run sequentially, so allow up to 25s; cron-job.org's
    // default request timeout is 30s, leaving headroom.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 25_000)
    const backendRes = await fetch(url, {
      method: req.method,
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    clearTimeout(timer)

    const text = await backendRes.text()

    if (!backendRes.ok) {
      console.error(
        `[reminders/cron/monthly] backend returned ${backendRes.status}: ${text.slice(0, 500)}`
      )
      return new NextResponse(text, {
        status: 502,
        headers: { "content-type": "application/json" },
      })
    }

    return new NextResponse(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  } catch (err) {
    // Backend unreachable or timed out — report failure to cron-job.org.
    console.error("[reminders/cron/monthly] backend call failed", err)
    return NextResponse.json(
      {
        error: "Backend unreachable",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    )
  }
}

export async function GET(req: NextRequest) {
  return handleMonthlyCron(req)
}

export async function POST(req: NextRequest) {
  return handleMonthlyCron(req)
}
