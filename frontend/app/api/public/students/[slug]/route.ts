import { NextRequest, NextResponse } from "next/server"
import { fetchPublicProfileFromAppwrite } from "@/lib/server-appwrite"

export const dynamic = "force-dynamic"

export async function GET(
  req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const slug = params?.slug?.trim() || ""
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 })
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
      `${backendBase.replace(/\/+$/, "")}/api/public/students/${encodeURIComponent(slug)}`,
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
    // Backend unreachable, fallback to Appwrite
  }

  // 2. Direct Appwrite resolution
  const profile = await fetchPublicProfileFromAppwrite(slug)
  const students = profile?.students ?? []

  return NextResponse.json(
    { data: students },
    {
      headers: { "Access-Control-Allow-Origin": "*" },
    }
  )
}
