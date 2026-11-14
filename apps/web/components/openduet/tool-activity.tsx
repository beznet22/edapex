"use client";

import type { ToolCallPart, ToolCallStatus } from "@edapex/contracts";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  CircleDashed,
  LoaderCircle,
  ShieldQuestion,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

const STATUS: Record<ToolCallStatus, { label: string; icon: LucideIcon; className: string }> = {
  running: { label: "Working", icon: LoaderCircle, className: "text-primary animate-spin" },
  completed: { label: "Done", icon: Check, className: "text-emerald-500" },
  failed: { label: "Didn’t work", icon: AlertTriangle, className: "text-destructive" },
  blocked: { label: "Blocked", icon: Ban, className: "text-destructive" },
  declined: { label: "You declined", icon: X, className: "text-muted-foreground" },
  refused: { label: "Refused", icon: Ban, className: "text-destructive" },
  waiting_for_person: { label: "Waiting for you", icon: ShieldQuestion, className: "text-primary" }
};

interface ToolActivityProps {
  readonly tools: readonly ToolCallPart[];
}

function ToolRow({ tool }: { readonly tool: ToolCallPart }) {
  const status = STATUS[tool.status];
  const Icon = status.icon;
  return (
    <li className="flex min-w-0 items-start gap-2.5 py-1.5 text-xs">
      <Icon aria-hidden="true" className={`mt-0.5 size-3.5 shrink-0 ${status.className}`} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate font-medium text-foreground">{tool.name}</span>
          <span className="text-muted-foreground">{status.label}</span>
        </div>
        {tool.summary.length > 0 ? (
          <p className="mt-0.5 break-words text-muted-foreground">{tool.summary}</p>
        ) : null}
        {tool.detail !== undefined && tool.detail.length > 0 ? (
          <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground/80">
            {tool.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Tool calls as pills.
 *
 * Actions needing a person stay expanded — they are the thing blocking the turn,
 * so hiding them behind a disclosure would be hostile. Settled steps collapse to
 * one line that still names what happened, because "3 steps" alone tells the
 * reader nothing about whether the turn did what they asked.
 */
export function ToolActivity({ tools }: ToolActivityProps) {
  const humanAction = tools.filter(
    (tool) => tool.status === "waiting_for_person" || tool.status === "running"
  );
  const settled = tools.filter(
    (tool) => tool.status !== "waiting_for_person" && tool.status !== "running"
  );

  if (tools.length === 0) return null;

  const failed = settled.filter(
    (tool) =>
      tool.status === "failed" || tool.status === "blocked" || tool.status === "refused"
  ).length;

  const preview = settled
    .slice(0, 2)
    .map((tool) => tool.name)
    .join(", ");

  return (
    <div className="space-y-1.5">
      {humanAction.length > 0 ? (
        <ul className="nested bg-muted/60 px-3 shadow-[var(--elevation-1)]">
          {humanAction.map((tool) => (
            <ToolRow key={tool.toolCallId} tool={tool} />
          ))}
        </ul>
      ) : null}

      {settled.length > 0 ? (
        <details className="group nested bg-muted/40 shadow-[var(--elevation-1)]">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs">
            <CircleDashed
              aria-hidden="true"
              className={failed > 0 ? "size-3.5 shrink-0 text-destructive" : "size-3.5 shrink-0 text-muted-foreground"}
            />
            <span className="shrink-0 font-medium text-foreground">
              {settled.length === 1 ? "1 step" : `${settled.length} steps`}
            </span>
            {preview.length > 0 ? (
              <span className="min-w-0 truncate text-muted-foreground">
                · {preview}
                {settled.length > 2 ? "…" : ""}
              </span>
            ) : null}
            {failed > 0 ? (
              <span className="shrink-0 rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                {failed} failed
              </span>
            ) : null}
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            />
          </summary>
          <ul className="px-3 pb-1">
            {settled.map((tool) => (
              <ToolRow key={tool.toolCallId} tool={tool} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
