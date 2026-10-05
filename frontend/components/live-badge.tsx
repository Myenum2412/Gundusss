import { cn } from "cn";

export function LiveBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border bg-card px-2.5 text-xs font-medium text-muted-foreground",
        className
      )}
      title="Data syncs live with the database"
    >
      <span className="relative flex size-1.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-600" />
      </span>
      Live
    </span>
  );
}
