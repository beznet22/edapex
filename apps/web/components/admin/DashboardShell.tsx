import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The dashboard's page container.
 *
 * One measure for every tab, so switching between Staff and Students does not resize the
 * page. `max-w-[92rem]` rather than the settings page's 700px: a directory is read as rows,
 * not as prose, and a narrow measure turns every table into a horizontal scroll.
 */
export function DashboardShell({
  title,
  description,
  actions,
  children
}: {
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex flex-col gap-4 px-4 pb-4 pt-5 sm:flex-row sm:items-start sm:justify-between lg:px-8 lg:pt-7">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{title}</h1>
          <p className="mt-1.5 max-w-prose text-[13px] leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
        {actions === undefined ? null : (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        )}
      </header>
      <div className="scrollbar-auto min-h-0 flex-1 overflow-y-auto px-4 pb-12 lg:px-8">
        {children}
      </div>
    </section>
  );
}

/**
 * A KPI tile.
 *
 * The number is the only display-weight element; the label is read once to locate the tile
 * and the delta carries direction *and* sentiment separately. `goodDirection` is per-metric
 * because a rise in absences is bad — a global "up is green" rule is wrong for half the
 * metrics a school actually tracks.
 */
/**
 * The tone of a tile's indicator dot.
 *
 * A dot rather than a coloured card: the reference uses coloured dots inside one neutral card
 * for exactly this reason — three tinted cards side by side compete for attention that only
 * one of them has earned, and the eye has nowhere to land.
 */
export type StatTone = "neutral" | "success" | "warning" | "danger";

const DOT: Readonly<Record<StatTone, string>> = {
  neutral: "bg-muted-foreground/50",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--destructive)]"
};

export function StatTile({
  label,
  value,
  qualifier,
  tone = "neutral",
  /** Draws attention when the number is not zero — a problem count of 0 needs no frame. */
  alertWhenNonZero = false,
  className
}: {
  readonly label: string;
  readonly value: number | string;
  readonly qualifier?: string;
  readonly tone?: StatTone;
  readonly alertWhenNonZero?: boolean;
  readonly className?: string;
}) {
  const numeric = typeof value === "number" ? value : null;
  const alert = alertWhenNonZero && numeric !== null && numeric > 0;

  return (
    <div
      className={cn(
        // On the canvas with a hairline, not nested inside another card.
        "rounded-[var(--radius-lg)] border bg-card px-4 py-3.5 transition-colors duration-200",
        alert ? "border-[var(--warning)]/40" : "border-border",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT[tone])} />
        <span className="text-[13px] font-medium leading-5 text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
        {value}
      </div>
      {qualifier === undefined ? null : (
        <div className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{qualifier}</div>
      )}
    </div>
  );
}
