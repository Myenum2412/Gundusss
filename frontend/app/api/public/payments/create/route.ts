import { NextRequest, NextResponse } from "next/server"
import { createPublicOrderInAppwrite } from "@/lib/server-appwrite"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    if (!body?.slug || !body?.amount) {
      return NextResponse.json(
        { error: "Invalid payment parameters: slug and amount required" },
        { status: 400 }
      )
    }

    // 1. Try local Fastify backend first
    const backendBase =
      process.env.BACKEND_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://127.0.0.1:4000"

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 2000)
      const backendRes = await fetch(
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
      clearTimeout(timer)

      if (backendRes.ok) {
        const json = await backendRes.json()
        return NextResponse.json(json, {
          headers: { "Access-Control-Allow-Origin": "*" },
        })
      }
    } catch {
      // Backend unreachable, fallback to server-appwrite
    }

    // 2. Fallback direct Appwrite order creation
    const order = await createPublicOrderInAppwrite({
      slug: body.slug,
      studentName: body.studentName || "Student",
      studentId: body.studentId,
      amount: body.amount,
      email: body.email,
      phone: body.phone,
      description: body.description,
    })

    return NextResponse.json(
      { data: order },
      { headers: { "Access-Control-Allow-Origin": "*" } }
    )
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to create payment order" },
      { status: 500 }
    )
  }
}
