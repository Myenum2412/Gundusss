import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { LoginForm } from "@/components/login-form"
import { AuthShell } from "@/components/auth-shell"
import { SESSION_COOKIE } from "@/lib/session-constants"

export default function LoginPage() {
  const session = cookies().get(SESSION_COOKIE)?.value
  if (session) {
    redirect("/dashboard")
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage students, fees, and receipts.">
      <LoginForm />
    </AuthShell>
  )
}
