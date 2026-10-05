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
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <SproutIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">seeds of success</span>
                <span className="truncate text-xs">Fees Manager</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
