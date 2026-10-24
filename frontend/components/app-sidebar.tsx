"use client"

import * as React from "react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { useAuth } from "@/components/auth-provider"
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
  CreditCardIcon,
  MegaphoneIcon,
  SettingsIcon,
  UsersIcon,
  Building2Icon,
  GitBranchIcon,
} from "lucide-react"
import type { Permission } from "@/lib/session"

interface NavItem {
  title: string
  url: string
  icon?: React.ReactNode
  permission: Permission
  /** Only the fixed developer account may see this destination. */
  superOnly?: boolean
  items?: { title: string; url: string; permission?: Permission }[]
}

// Sidebar menu for Seeds of Success fees app. Items are filtered by the signed
// in user's role so a viewer never sees admin-only destinations.
const navigation: { navMain: NavItem[]; navBottom: NavItem[] } = {
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard",
      icon: <LayoutDashboardIcon />,
      permission: "data:read",
    },
    {
      title: "Branches",
      url: "/dashboard/branches",
      icon: <GitBranchIcon />,
      permission: "data:read",
    },
    {
      title: "Students",
      url: "#",
      icon: <GraduationCapIcon />,
      permission: "data:read",
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
      permission: "data:read",
    },
    {
      title: "Receipts",
      url: "/dashboard/receipts",
      icon: <ReceiptIcon />,
      permission: "data:read",
    },
    {
      title: "Payments",
      url: "/dashboard/payments",
      icon: <CreditCardIcon />,
      permission: "data:read",
    },
    {
      title: "Announcement",
      url: "/dashboard/announcements",
      icon: <MegaphoneIcon />,
      permission: "data:read",
    },
  ],
  navBottom: [
    {
      title: "Users",
      url: "/dashboard/users",
      icon: <UsersIcon />,
      permission: "users:manage",
    },
    {
      title: "Settings",
      url: "/dashboard/settings",
      icon: <SettingsIcon />,
      permission: "settings:manage",
    },
    {
      title: "Organizations",
      url: "/orgmenu/dashboard",
      icon: <Building2Icon />,
      permission: "data:read",
      superOnly: true,
    },
  ],
}

function forNav(
  items: NavItem[],
  can: (permission: Permission) => boolean,
  isSuper: boolean
) {
  return items
    .filter((item) => !item.superOnly || isSuper)
    .filter((item) => can(item.permission))
    .map(({ title, url, icon, items: subItems }) => ({
      title,
      url,
      icon,
      items: subItems,
    }))
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user, can, isSuper, activeProfile } = useAuth()
  const navMain = forNav(navigation.navMain, can, isSuper)
  const navBottom = forNav(navigation.navBottom, can, isSuper)

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
                <span className="truncate text-[13px] font-semibold tracking-tight">
                  {activeProfile.name}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {activeProfile.profileId}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className="my-1" />
      <SidebarContent className="flex flex-col gap-2 px-2">
        <NavMain items={navMain} />
        {navBottom.length > 0 && (
          <div className="mt-auto">
            <SidebarSeparator className="mx-0 mb-2" />
            <NavMain items={navBottom} label={null} />
          </div>
        )}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
