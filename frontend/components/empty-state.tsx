import * as React from "react"
import { cn } from "@/lib/utils"

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 px-6 py-12 text-center sm:py-14",
        className
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl border border-border bg-gradient-to-b from-muted to-muted/40 text-muted-foreground shadow-xs [&_svg]:size-5">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}

export function TableCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        "card-elevated animate-enter overflow-hidden",
        className
      )}
    >
      {children}
    </div>
  )
}
