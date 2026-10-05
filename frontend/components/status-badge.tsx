import { cn } from "@/lib/utils"

const styles: Record<string, string> = {
  active:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/20",
  paid:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/20",
  sent:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/20",
  connected:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/20",
  ready:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300 dark:ring-emerald-400/20",
  pending:
    "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25",
  partial:
    "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25",
  starting:
    "bg-amber-500/10 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25",
  qr: "bg-sky-500/10 text-sky-700 ring-sky-600/25 dark:text-sky-300 dark:ring-sky-400/25",
  overdue:
    "bg-rose-500/10 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
  failed:
    "bg-rose-500/10 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
  error:
    "bg-rose-500/10 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
  cancelled:
    "bg-rose-500/10 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
  inactive:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/25 dark:text-zinc-300 dark:ring-zinc-400/25",
  disconnected:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/25 dark:text-zinc-300 dark:ring-zinc-400/25",
  idle:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/25 dark:text-zinc-300 dark:ring-zinc-400/25",
}

export function StatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const key = status.trim().toLowerCase().replace(/\s+/g, "")
  const tone =
    styles[key] ??
    "bg-primary/8 text-primary ring-primary/20 dark:text-primary-foreground"
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        tone,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {status}
    </span>
  )
}
