"use client"

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
import { cn } from "cn"

export function DashboardShell({
  trail,
  actions,
  children,
  contentClassName,
}: {
  trail: { label: string; href?: string }[]
  actions?: React.ReactNode
  children: React.ReactNode
  contentClassName?: string
}) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh overflow-hidden">
        {/* Slim sticky header — Linear / Stripe style */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-backdrop-filter:bg-background/60">
          <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-4 data-vertical:self-auto" />
          <Breadcrumb>
            <BreadcrumbList>
              {trail.map((t, i) => {
                const last = i === trail.length - 1
                return (
                  <React.Fragment key={t.label}>
                    {i > 0 && <BreadcrumbSeparator className="hidden md:block" />}
                    <BreadcrumbItem className={i === 0 ? "hidden md:block" : undefined}>
                      {last || !t.href ? (
                        <BreadcrumbPage className="font-medium">{t.label}</BreadcrumbPage>
                      ) : (
                        <BreadcrumbLink href={t.href} className="text-muted-foreground hover:text-foreground">
                          {t.label}
                        </BreadcrumbLink>
                      )}
                    </BreadcrumbItem>
                  </React.Fragment>
                )
              })}
            </BreadcrumbList>
          </Breadcrumb>
          {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
        </header>

        {/* Full width + full height content area. Tables flex to fill. */}
        <div className={cn("app-shell-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6", contentClassName)}>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

export function PageHeader({
  title,
  description,
  meta,
  actions,
}: {
  title: string
  description: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {meta}
        </div>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}
