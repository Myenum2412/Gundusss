import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AuthShell } from "@/components/auth-shell"
import { SignupForm } from "@/components/signup-form"
import { SESSION_COOKIE } from "@/lib/session-constants"

export default function SignupPage() {
  const session = cookies().get(SESSION_COOKIE)?.value
  if (session) {
    redirect("/dashboard")
  }

  return (
    <AuthShell
      title="Create your workspace"
      subtitle="Sign up to get a private profile ID and a payment link of your own."
      panelTitle="One workspace. One payment link."
      panelSubtitle="Every signup gets a unique profile ID, an isolated set of students and receipts, and a public payment page at myfees.myenum.in."
    >
      <SignupForm />
    </AuthShell>
  )
}
