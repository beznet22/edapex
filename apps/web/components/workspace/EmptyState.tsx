"use client";

import type { ReactNode } from "react";

import { EmptyBlankArt, EmptyFailedArt, EmptyNoResultsArt } from "@/components/workspace/EmptyArt";
import { cn } from "@/lib/utils";

/**
 * The empty-state block.
 *
 * Three variants because they mean three different things, and a single generic "nothing
 * here" is why empty states get ignored:
 *
 * - `blank` — first run. Optimistic, points at the action.
 * - `no-results` — a query excluded everything. Offers to clear it.
 * - `failed` — something broke. Flat, with a retry; never playful.
 *
 * The illustration is decorative (`aria-hidden`) and the heading carries the meaning, so a
 * screen reader gets the sentence rather than a description of a drawing.
 */
export type EmptyKind = "blank" | "no-results" | "failed";

const ART = {
  blank: EmptyBlankArt,
  "no-results": EmptyNoResultsArt,
  failed: EmptyFailedArt
} as const;

export interface EmptyStateProps {
  readonly kind: EmptyKind;
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
  readonly className?: string;
  /** Narrows the text measure; long prose in a 760px column is hard to read. */
  readonly compact?: boolean;
}

export function EmptyState({
  kind,
  title,
  description,
  action,
  className,
  compact = false
}: EmptyStateProps) {
  const Art = ART[kind];
  const tone = kind === "failed" ? "text-destructive/70" : "text-muted-foreground/60";

  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        className
      )}
    >
      <Art className={cn("size-[72px]", tone)} />
      <h2 className="mt-5 text-[15px] font-semibold tracking-tight">{title}</h2>
      <p
        className={cn(
          "mt-2 text-[13px] leading-6 text-muted-foreground",
          compact ? "max-w-[34ch]" : "max-w-[46ch]"
        )}
      >
        {description}
      </p>
      {action === undefined ? null : <div className="mt-5">{action}</div>}
    </div>
  );
}
