"use client";

import { useMemo } from "react";
import { ListChecks } from "lucide-react";

import { EmptyState } from "@/components/workspace/EmptyState";
import {
  compareTasks,
  deriveTaskState,
  needsPerson,
  retryView,
  TASK_STATE_LABELS,
  type TaskSignals,
  type TaskState
} from "@edapex/contracts";

/**
 * Tasks surface.
 *
 * A needs-input queue, not a chronological list. Ordering comes from the shared
 * `compareTasks`, so what is blocking a live turn sits above what is merely old,
 * and the header count uses the same `needsPerson` predicate as the rows — one
 * rule, so the badge and the list cannot disagree.
 *
 * Task rows arrive with the remaining chunk-4 work; until then the list is empty
 * and says so rather than showing invented data.
 */

export interface TaskRow {
  readonly id: string;
  readonly title: string;
  readonly why: string | null;
  readonly createdAt: number;
  readonly signals: TaskSignals;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
}

export function TasksSurface({
  tasks = [],
  notice
}: {
  readonly tasks?: readonly TaskRow[];
  /** The availability trade, shown rather than implied. */
  readonly notice?: string;
}) {
  const rows = useMemo(
    () =>
      tasks
        .map((task) => ({ ...task, state: deriveTaskState(task.signals) }))
        .sort(compareTasks),
    [tasks]
  );

  const waiting = rows.filter((row) => needsPerson(row.state)).length;

  if (rows.length === 0) {
    return (
      <section className="flex flex-1 items-center justify-center">
        <EmptyState
          description="Work the agent asks you to decide appears here. Routines run while EdApex is open, so this list fills as they report back."
          kind="blank"
          title="Nothing needs you"
        />
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <header className="flex items-baseline justify-between gap-3 px-4 pb-2 pt-4 lg:px-8 lg:pt-6">
        {/* Wide on desktop: the chat measure does not apply to a dashboard. */}
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Tasks</h1>
        {waiting > 0 ? (
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[13px] font-medium text-primary">
            {waiting} need{waiting === 1 ? "s" : ""} you
          </span>
        ) : null}
      </header>

      {notice === undefined ? null : (
        <p className="px-4 pb-1 text-[13px] leading-5 text-muted-foreground lg:px-8">{notice}</p>
      )}

      <ul className="scrollbar-auto min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-6 pt-2 lg:px-8">
        {rows.map((row) => {
          const retry = retryView({
            attempts: row.attempts,
            maxAttempts: row.maxAttempts,
            lastError: row.lastError
          });

          return (
            <li className="rounded-[14px] bg-card p-4 shadow-[var(--elevation-1)]" key={row.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium leading-6">{row.title}</p>
                  {row.why === null ? null : (
                    <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{row.why}</p>
                  )}
                </div>
                <StatePill state={row.state} />
              </div>

              {/* Shown, never hidden. A silent retry teaches people to distrust the
                  result: they cannot tell one attempt from four. */}
              {retry === null ? null : (
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Attempt {retry.attempt} of {retry.of}
                  {retry.reason === null ? null : ` — ${retry.reason}`}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatePill({ state }: { readonly state: TaskState }) {
  // Tone carries meaning: gold only for what a person must act on, so the accent
  // keeps its value instead of decorating every row.
  const tone =
    state === "needs_you" || state === "blocked"
      ? "bg-primary/15 text-primary"
      : state === "didnt_work"
        ? "bg-destructive/10 text-destructive"
        : "bg-muted text-muted-foreground";

  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[13px] font-medium ${tone}`}>
      {TASK_STATE_LABELS[state]}
    </span>
  );
}
