import type { ReactNode } from "react";

import { cn } from "@edapex/ui/lib/utils";

/**
 * No app bar: a title and one action, both of which leave while you read.
 *
 * `collapsed` is driven by `useScrollCollapse`, and the transition is a passthrough of
 * `motion-spatial-fast` — geometry only, so the header does not fade its text colour on the
 * way out.
 *
 * The title truncates rather than wrapping: two lines of header is an app bar by another
 * name, and that is the thing this avoids.
 */
export function ScreenHeader({
  title,
  action,
  collapsed = false
}: {
  readonly title: string;
  readonly action?: ReactNode;
  readonly collapsed?: boolean;
}) {
  return (
    <header
      className={cn(
        "motion-spatial-fast sticky top-0 z-20 flex h-header shrink-0 items-center justify-between gap-2 bg-background px-gutter",
        "data-[collapsed=true]:pointer-events-none data-[collapsed=true]:-translate-y-full data-[collapsed=true]:opacity-0"
      )}
      data-collapsed={collapsed}
    >
      <h1 className="min-w-0 truncate text-title">{title}</h1>
      {action === undefined ? null : <div className="flex shrink-0 items-center gap-1">{action}</div>}
    </header>
  );
}
