import { NextRequest, NextResponse } from "next/server"
import { backendBaseUrl } from "@/lib/backend-base"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params?.slug?.trim() || ""
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 })
  }

  const backendBase = backendBaseUrl()

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6_000)
    const backendRes = await fetch(
      `${backendBase}/api/public/students/${encodeURIComponent(slug)}`,
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
        { data: [] },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      )
    }
  } catch {
    // Network error / timeout — fall through to the 502 response below.
  }

  return NextResponse.json(
    { error: "The student list service is unreachable right now. Please retry." },
    { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
  )
}
