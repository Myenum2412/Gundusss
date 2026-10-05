import * as React from "react"
import { cn } from "@/lib/utils"

export function StatCard({
  icon,
  label,
  value,
  hint,
  className,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "card-elevated card-elevated-hover animate-enter group relative overflow-hidden p-5",
        className
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-32 rounded-full bg-gradient-to-br from-primary/12 to-transparent blur-2xl transition-opacity duration-200 group-hover:opacity-100"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl border border-border bg-gradient-to-b from-muted to-muted/30 text-foreground shadow-xs [&_svg]:size-[18px]">
          {icon}
        </div>
      </div>
      <div className="mt-4 space-y-1">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </p>
        {hint && (
          <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  )
}
