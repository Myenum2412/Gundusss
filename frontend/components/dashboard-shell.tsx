import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export type Crumb = { label: string; href?: string }

export function DashboardShell({
  crumbs,
  title,
  description,
  action,
  children,
  contentClassName,
}: {
  crumbs: Crumb[]
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="surface-sunken min-h-svh">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-2 backdrop-blur-xl transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 sm:px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-2">
            <SidebarTrigger className="-ml-1 shrink-0" />
            <Separator
              orientation="vertical"
              className="mr-2 data-vertical:h-4 data-vertical:self-auto"
            />
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1
                  return (
                    <React.Fragment key={`${c.label}-${i}`}>
                      {i > 0 && (
                        <BreadcrumbSeparator className="hidden md:block" />
                      )}
                      <BreadcrumbItem
                        className={last ? undefined : "hidden md:block"}
                      >
                        {last || !c.href ? (
                          <BreadcrumbPage>{c.label}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink href={c.href}>
                            {c.label}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </React.Fragment>
                  )
                })}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div
          className={cn(
            "mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8",
            contentClassName
          )}
        >
          <div className="animate-enter flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
                {title}
              </h1>
              {description && (
                <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
            {action && (
              <div className="flex shrink-0 items-center gap-2">{action}</div>
            )}
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
