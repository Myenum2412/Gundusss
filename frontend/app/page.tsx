import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { SESSION_COOKIE } from "@/lib/session-constants"

export default function Home() {
  const session = cookies().get(SESSION_COOKIE)?.value
  redirect(session ? "/dashboard" : "/login")
}
