import type { ReactNode } from "react";

import { cn } from "@edapex/ui/lib/utils";

/**
 * A 44dp hit area around something that looks smaller.
 *
 * The alternative — making every icon visually 44dp — makes a toolbar look like a toy. This
 * grows the *target* without growing the chrome, and it is the same trick the registry
 * `Button` uses with `after:-inset-1`.
 */
export function TouchTarget({
  children,
  label,
  onPress,
  className
}: {
  readonly children: ReactNode;
  readonly label: string;
  readonly onPress?: () => void;
  readonly className?: string;
}) {
  return (
    <button
      aria-label={label}
      className={cn(
        "relative inline-flex min-h-touch min-w-touch items-center justify-center rounded-lg text-muted-foreground",
        "motion-effects-fast outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
      onClick={onPress}
      type="button"
    >
      {children}
    </button>
  );
}
