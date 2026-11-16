import type { ReactNode } from "react";

import { cn } from "@edapex/ui/lib/utils";

/**
 * The paper surface.
 *
 * `--paper` is warmer than `--card` and carries its own ink and hairline, so a document
 * reads as a document rather than as a panel. Used by scan review, report cards and the
 * onboarding card — the places where the app is allowed to look like an object.
 */
export function PaperSurface({
  children,
  className
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-paper-line bg-paper p-gutter text-paper-ink shadow-paper",
        className
      )}
    >
      {children}
    </div>
  );
}
