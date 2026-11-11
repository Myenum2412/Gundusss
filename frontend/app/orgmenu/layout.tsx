import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AuthProvider } from "@/components/auth-provider"
import { DashboardFrame } from "@/components/dashboard-frame"
import { SIDEBAR_COOKIE_NAME } from "@/lib/sidebar-cookie"
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

  // Share the same persistent sidebar chrome as the workspace dashboard, so
  // moving between /dashboard and /orgmenu/dashboard never remounts the rail.
  const stored = cookies().get(SIDEBAR_COOKIE_NAME)?.value
  const defaultOpen = stored !== "false"

  return (
    <AuthProvider>
      <DashboardFrame defaultOpen={defaultOpen}>{children}</DashboardFrame>
    </AuthProvider>
  )
}
