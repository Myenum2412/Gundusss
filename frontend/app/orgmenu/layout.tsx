import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AuthProvider } from "@/components/auth-provider"
import { SESSION_COOKIE } from "@/lib/session-constants"

export default function OrgMenuLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Cookie gate for the console. The client checks `super`, and every console
  // API call is independently rejected for non-super accounts by the backend.
  const session = cookies().get(SESSION_COOKIE)?.value
  if (!session) {
    redirect("/login")
  }

  return <AuthProvider>{children}</AuthProvider>
}
