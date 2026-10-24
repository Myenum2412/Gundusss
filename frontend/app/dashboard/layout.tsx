import { cookies } from "next/headers"

import { DashboardFrame } from "@/components/dashboard-frame"
import { SIDEBAR_COOKIE_NAME } from "@/lib/sidebar-cookie"

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Keep the collapsed ("icon") sidebar collapsed after a hard reload, and
  // mount the chrome once so client-side navigation preserves its state.
  const stored = cookies().get(SIDEBAR_COOKIE_NAME)?.value
  const defaultOpen = stored !== "false"

  return <DashboardFrame defaultOpen={defaultOpen}>{children}</DashboardFrame>
}
