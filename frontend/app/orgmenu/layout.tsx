import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AuthProvider } from "@/components/auth-provider"
import { OrgMenuFrame } from "@/components/orgmenu-frame"
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

  const stored = cookies().get(SIDEBAR_COOKIE_NAME)?.value
  const defaultOpen = stored !== "false"

  return (
    <AuthProvider>
      <OrgMenuFrame defaultOpen={defaultOpen}>{children}</OrgMenuFrame>
    </AuthProvider>
  )
}
