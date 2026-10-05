"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import {
  SproutIcon,
  LayoutDashboardIcon,
  GraduationCapIcon,
  ClipboardListIcon,
  ReceiptIcon,
  MegaphoneIcon,
  SettingsIcon,
} from "lucide-react"

// Sidebar menu for Seeds of Success fees app.
const data = {
  user: {
    name: "Admin",
    email: "admin@seedsofsuccess.in",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
    },
    {
      title: "Students",
      url: "#",
      icon: <GraduationCapIcon />,
      items: [
        {
          title: "All Students",
          url: "/dashboard/students",
        },
        {
          title: "Student Groups",
          url: "/dashboard/students/groups",
        },
      ],
    },
    {
      title: "Fee Structure",
      url: "/dashboard/fee-structure",
      icon: <ClipboardListIcon />,
    },
    {
      title: "Receipts",
      url: "/dashboard/receipts",
      icon: <ReceiptIcon />,
    },
    {
      title: "Announcement",
      url: "/dashboard/announcements",
      icon: <MegaphoneIcon />,
    },
  ],
  navBottom: [
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: <SettingsIcon />,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-3 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="rounded-xl hover:bg-sidebar-accent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
                <SproutIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-[13px] font-semibold tracking-tight">Seeds of Success</span>
                <span className="truncate text-[11px] text-muted-foreground">Fees Manager</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className="my-1" />
      <SidebarContent className="flex flex-col gap-2 px-2">
        <NavMain items={data.navMain} />
        <div className="mt-auto">
          <SidebarSeparator className="mx-0 mb-2" />
          <NavMain items={data.navBottom} label={null} />
        </div>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
