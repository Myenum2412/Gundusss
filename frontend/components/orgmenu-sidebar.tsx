"use client"

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
  Building2Icon,
  LayersIcon,
  ShieldCheckIcon,
  StoreIcon,
  TerminalIcon,
} from "lucide-react"

// The organization console has its own chrome and deliberately exposes no
// workspace-dashboard or settings destinations. It is a standalone console.
const navigation = {
  navMain: [
    {
      title: "Organizations",
      url: "/orgmenu/dashboard",
      icon: <Building2Icon />,
    },
    {
      title: "Workspaces",
      url: "/orgmenu/dashboard#workspaces",
      icon: <LayersIcon />,
    },
    {
      title: "Operations Hub",
      url: "/orgmenu/dashboard#operations",
      icon: <StoreIcon />,
    },
    {
      title: "Control Center (Logs)",
      url: "/orgmenu/dashboard#control-center",
      icon: <TerminalIcon />,
    },
  ],
}

export function OrgMenuSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-3 pt-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="rounded-xl hover:bg-sidebar-accent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground shadow-sm">
                <ShieldCheckIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate text-[13px] font-semibold tracking-tight">
                  Organization console
                </span>
                <span className="truncate text-[10px] text-muted-foreground">
                  Super admin control room
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarSeparator className="my-1" />
      <SidebarContent className="flex flex-col gap-2 px-2">
        <NavMain items={navigation.navMain} label="Console" />
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
