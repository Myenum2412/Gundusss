import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AuthProvider } from "@/components/auth-provider"
import { DashboardFrame } from "@/components/dashboard-frame"
import { SIDEBAR_COOKIE_NAME } from "@/lib/sidebar-cookie"
import { SESSION_COOKIE } from "@/lib/session-constants"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Page access requires a session cookie. The cookie is only a UI gate; the
  // backend verifies the signed token behind every API request.
  const session = cookies().get(SESSION_COOKIE)?.value
  if (!session) {
    redirect("/login")
  }

  // Keep the collapsed ("icon") sidebar collapsed after a hard reload, and
  // mount the chrome once so client-side navigation preserves its state.
  const stored = cookies().get(SIDEBAR_COOKIE_NAME)?.value
  const defaultOpen = stored !== "false"

  return (
    <AuthProvider>
      <DashboardFrame defaultOpen={defaultOpen}>{children}</DashboardFrame>
    </AuthProvider>
  )
}
