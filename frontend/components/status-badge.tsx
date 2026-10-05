"use client"

import { cn } from "cn"

const tones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-400",
  amber: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400",
  red: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-400",
  blue: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-400",
  neutral: "bg-muted text-muted-foreground ring-border",
}

function toneFor(value: string): string {
  const v = value.toLowerCase()
  if (["paid", "active", "sent", "connected", "ready"].includes(v)) return tones.green
  if (["pending", "partial", "starting", "qr"].includes(v)) return tones.amber
  if (["overdue", "failed", "error", "disconnected", "inactive"].includes(v)) return tones.red
  if (["sent", "announcement"].includes(v)) return tones.blue
  return tones.neutral
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneFor(value),
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {value}
    </span>
  )
}
