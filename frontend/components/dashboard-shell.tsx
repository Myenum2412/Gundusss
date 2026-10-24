"use client"

import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { useAuth } from "@/components/auth-provider"
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
  const { can, user } = useAuth()
  const canWrite = can("data:write")

  return (
    <>
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
        <div className="ml-auto flex items-center gap-2">
          {!canWrite && (
            <span className="rounded-full border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              {user.role === "viewer" ? "Read-only" : "No write access"}
            </span>
          )}
          {actions && canWrite && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </header>

      {/* Full width + full height content area. Tables flex to fill. */}
      <div className={cn("app-shell-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 md:p-6", contentClassName)}>
        {children}
      </div>
    </>
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
  const { can } = useAuth()
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <h1 className="truncate text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {meta}
        </div>
        <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{description}</p>
      </div>
      {actions && can("data:write") && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </div>
  )
}
