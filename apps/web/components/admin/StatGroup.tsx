"use client";

import { cn } from "@/lib/utils";

/**
 * The grouped stat card.
 *
 * The reference does not use four identical tiles: one card holds three metrics side by side,
 * separated by vertical hairlines, each with its own coloured dot. That structure is the point
 * — the three numbers belong to one question ("who is in what state"), and splitting them into
 * four equal cards gives each one the same weight as the total, which is wrong.
 *
 * The dot is the indicator. A tinted card per metric is the "coloured card soup" failure: four
 * coloured surfaces compete for attention, and the eye has nowhere to land. One neutral card
 * with one coloured dot per metric puts the colour exactly where the meaning is.
 */
export type MetricTone = "neutral" | "success" | "warning" | "danger";

const DOT: Readonly<Record<MetricTone, string>> = {
  neutral: "bg-muted-foreground/45",
  success: "bg-[var(--success)]",
  warning: "bg-[var(--warning)]",
  danger: "bg-[var(--destructive)]"
};

export interface Metric {
  readonly label: string;
  readonly value: number | string;
  readonly tone: MetricTone;
}

export function StatGroup({
  title,
  metrics,
  /** Shown top-right, as the reference puts a timestamp beside "Total Estimate". */
  aside,
  className
}: {
  readonly title: string;
  readonly metrics: readonly Metric[];
  readonly aside?: string;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3.5",
        className
      )}
    >
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-medium leading-5 text-muted-foreground">{title}</h2>
        {aside === undefined ? null : (
          <span className="text-[11px] text-muted-foreground">{aside}</span>
        )}
      </header>

      <dl className="mt-2.5 flex flex-wrap items-end gap-x-6 gap-y-2">
        {metrics.map((metric, index) => (
          <div
            className={cn(
              "min-w-0",
              // Hairlines between, not around: the metrics are one group, and a border on each
              // would turn a card into a row of boxes.
              index > 0 && "border-l border-border pl-6"
            )}
            key={metric.label}
          >
            <dt className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT[metric.tone])} />
              <span className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
                {metric.label}
              </span>
            </dt>
            <dd className="mt-1 text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
              {metric.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * A single figure with an optional proportion badge.
 *
 * The badge is a real ratio, not a fabricated trend: we have no time series, and inventing a
 * delta would be a claim about history the database does not hold. `24 / 25 linked` is
 * something we can prove.
 */
export function StatFigure({
  title,
  value,
  caption,
  badge,
  tone = "neutral",
  className
}: {
  readonly title: string;
  readonly value: number | string;
  readonly caption?: string;
  readonly badge?: string;
  readonly tone?: MetricTone;
  readonly className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3.5",
        className
      )}
    >
      <header className="flex items-center gap-1.5">
        <span aria-hidden="true" className={cn("size-1.5 rounded-full", DOT[tone])} />
        <h2 className="text-[13px] font-medium leading-5 text-muted-foreground">{title}</h2>
      </header>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
          {value}
        </span>
        {badge === undefined ? null : (
          <span className="rounded-full border border-border px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-foreground/70">
            {badge}
          </span>
        )}
      </div>
      {caption === undefined ? null : (
        <p className="mt-1.5 text-[12px] leading-5 text-muted-foreground">{caption}</p>
      )}
    </section>
  );
}
