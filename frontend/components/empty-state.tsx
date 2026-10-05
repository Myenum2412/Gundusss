import type { LucideIcon } from "lucide-react"
import { InboxIcon } from "lucide-react"
import { cn } from "cn"

export function EmptyState({
  icon: Icon = InboxIcon,
  title,
  hint,
  className,
}: {
  icon?: LucideIcon
  title: string
  hint: string
  className?: string
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2 px-6 py-16 text-center", className)}>
      <div className="flex size-11 items-center justify-center rounded-2xl border bg-muted/60 text-muted-foreground">
        <Icon className="size-5" strokeWidth={1.75} />
      </div>
      <p className="mt-2 text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>
    </div>
  )
}
