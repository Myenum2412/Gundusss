"use client"

import * as React from "react"

import { OrgMenuSidebar } from "@/components/orgmenu-sidebar"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

// Mounted once by app/orgmenu/layout.tsx so console navigation keeps the
// organization sidebar's state instead of remounting it on every page.
export function OrgMenuFrame({
  defaultOpen,
  children,
}: {
  defaultOpen: boolean
  children: React.ReactNode
}) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <OrgMenuSidebar />
      <SidebarInset className="h-svh overflow-hidden">{children}</SidebarInset>
    </SidebarProvider>
  )
}
