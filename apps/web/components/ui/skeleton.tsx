import { cn } from "@/lib/utils"

/*
 * Vendored shadcn, with one local change: `skeleton-shimmer` instead of `animate-pulse`.
 *
 * The design spec allows exactly one loading affordance, and this file is the reason two
 * would otherwise exist — `packages/chat` has its own `Skeleton`, so a page mixing the two
 * shows a pulsing block beside a sweeping one. The shadcn sidebar is the only consumer.
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-md bg-primary/10", className)}
      {...props}
    />
  )
}

export { Skeleton }
