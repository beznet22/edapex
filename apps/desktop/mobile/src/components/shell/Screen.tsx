import type { ReactNode } from "react";

import { cn } from "@edapex/ui/lib/utils";

/**
 * The edge-to-edge surface every screen starts from.
 *
 * **This is the only place safe-area padding is written.** A leaf component that reaches for
 * `env()` is how an app ends up with double padding on one screen and none on another. The
 * inset values themselves are resolved once in `styles/globals.css`.
 */
export function Screen({
  children,
  className
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "screen-top flex h-dvh w-full flex-col overflow-hidden bg-background text-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
