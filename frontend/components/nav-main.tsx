"use client"

import { usePathname } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { ChevronRightIcon } from "lucide-react"

export function NavMain({
  items,
  label = "Workspace",
}: {
  items: {
    title: string
    url: string
    icon?: React.ReactNode
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
  label?: string | null
}) {
  const pathname = usePathname()
  const isActiveUrl = (url: string) =>
    url !== "#" && (pathname === url || pathname.startsWith(url + "/"))

  return (
    <SidebarGroup className="p-0">
      {label && (
        <SidebarGroupLabel className="px-2 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarMenu className="gap-0.5">
        {items.map((item) => {
          const active = item.isActive ?? isActiveUrl(item.url) ?? item.items?.some((s) => isActiveUrl(s.url))
          return item.items?.length ? (
            <Collapsible
              key={item.title}
              defaultOpen={Boolean(active)}
              className="group/collapsible"
              render={<SidebarMenuItem />}
            >
              <CollapsibleTrigger
                render={<SidebarMenuButton tooltip={item.title} isActive={Boolean(active)} className="h-8.5 rounded-[10px] px-2.5 text-[13px] font-medium data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-[inset_0_0_0_1px_var(--sidebar-border)]" />}
              >
                {item.icon}
                <span>{item.title}</span>
                <ChevronRightIcon className="ml-auto size-3.5 text-muted-foreground transition-transform duration-200 group-data-open/collapsible:rotate-90" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mx-2 border-sidebar-border/80">
                  {item.items?.map((subItem) => (
                    <SidebarMenuSubItem key={subItem.title}>
                      <SidebarMenuSubButton
                        render={<a href={subItem.url} />}
                        isActive={isActiveUrl(subItem.url)}
                        className="h-7.5 rounded-lg text-[13px] data-active:bg-sidebar-accent data-active:font-medium"
                      >
                        <span>{subItem.title}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </CollapsibleContent>
            </Collapsible>
          ) : (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                render={<a href={item.url} />}
                tooltip={item.title}
                isActive={Boolean(active)}
                className="h-8.5 rounded-[10px] px-2.5 text-[13px] font-medium data-active:bg-sidebar-accent data-active:text-sidebar-accent-foreground data-active:shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
              >
                {item.icon}
                <span>{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
