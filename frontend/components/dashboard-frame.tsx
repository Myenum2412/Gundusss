"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ViewingProfileBanner } from "@/components/viewing-profile-banner"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

// Rendered once by app/dashboard/layout.tsx so switching pages never remounts
// the sidebar (which used to reset it to expanded mid-navigation).
export function DashboardFrame({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean
  children: React.ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        <ViewingProfileBanner />
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
