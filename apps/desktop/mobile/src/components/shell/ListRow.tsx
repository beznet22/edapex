import type { ReactNode } from "react";

import { cn } from "@edapex/ui/lib/utils";

/**
 * A settings or list row: label and description left, control right, hairline between.
 *
 * A row is a row — ten bordered cards is a stack of boxes, and a settings page made of them
 * is unreadable at a glance. `min-h-row` lets the row grow with a 200% text scale instead of
 * clipping, which `h-row` would not.
 */
export function ListRow({
  label,
  description,
  control,
  leading,
  onPress,
  className
}: {
  readonly label: string;
  readonly description?: string;
  readonly control?: ReactNode;
  readonly leading?: ReactNode;
  readonly onPress?: () => void;
  readonly className?: string;
}) {
  const content = (
    <>
      {leading === undefined ? null : <span className="shrink-0 text-muted-foreground">{leading}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body">{label}</span>
        {description === undefined ? null : (
          <span className="mt-0.5 block text-label text-muted-foreground">{description}</span>
        )}
      </span>
      {control === undefined ? null : <span className="shrink-0">{control}</span>}
    </>
  );

  const shared = cn(
    "flex min-h-row w-full items-center gap-3 border-b border-border px-gutter py-2 text-left",
    className
  );

  if (onPress === undefined) {
    return <div className={shared}>{content}</div>;
  }

  return (
    <button
      className={cn(
        shared,
        "motion-effects-fast outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      )}
      onClick={onPress}
      type="button"
    >
      {content}
    </button>
  );
}
