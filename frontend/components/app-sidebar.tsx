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
} from "@/components/ui/sidebar"
import {
  SproutIcon,
  LayoutDashboardIcon,
  WalletIcon,
  GraduationCapIcon,
  ClipboardListIcon,
  ReceiptIcon,
  CreditCardIcon,
  MegaphoneIcon,
  ChartColumnIcon,
  SettingsIcon,
} from "lucide-react"

// Sidebar menu for Seeds of Success fees app.
const data = {
  user: {
    name: "shadcn",
    email: "m@example.com",
    avatar: "/avatars/shadcn.jpg",
  },
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
      isActive: true,
    },
    {
      title: "Fees",
      url: "/dashboard/fees",
      icon: <WalletIcon />,
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
      title: "Billing",
      url: "/dashboard/billing",
      icon: <CreditCardIcon />,
    },
    {
      title: "Announcement",
      url: "/dashboard/announcements",
      icon: <MegaphoneIcon />,
    },
    {
      title: "Reports",
      url: "/dashboard/reports",
      icon: <ChartColumnIcon />,
    },
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
      <SidebarHeader className="pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="rounded-2xl transition-colors duration-200 hover:bg-sidebar-accent">
              <div className="flex aspect-square size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-primary to-indigo-700 text-primary-foreground shadow-md shadow-primary/25">
                <SproutIcon className="size-4.5" />
              </div>
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-[13.5px] font-semibold tracking-tight">Seeds of Success</span>
                <span className="truncate text-[11.5px] text-muted-foreground">Fees Manager</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="gap-1 px-2">
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border/80 p-2">
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
