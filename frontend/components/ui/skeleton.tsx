import { cn } from "cn"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "animate-pulse rounded-xl bg-gradient-to-br from-muted via-muted/60 to-muted",
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
