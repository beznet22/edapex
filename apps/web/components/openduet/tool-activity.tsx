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
  running: { label: "In progress", icon: LoaderCircle, className: "text-primary animate-spin" },
  completed: { label: "Done", icon: Check, className: "text-emerald-400" },
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
        <p className="mt-0.5 break-words text-muted-foreground">{tool.summary}</p>
        {tool.detail !== undefined && tool.detail.length > 0 ? (
          <p className="mt-1 break-words text-[11px] leading-4 text-muted-foreground/80">
            {tool.detail}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export function ToolActivity({ tools }: ToolActivityProps) {
  const humanAction = tools.filter(
    (tool) => tool.status === "waiting_for_person" || tool.status === "running"
  );
  const settled = tools.filter(
    (tool) => tool.status !== "waiting_for_person" && tool.status !== "running"
  );

  if (tools.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {humanAction.length > 0 ? (
        <ul className="rounded-lg border border-border bg-card/70 px-2.5">
          {humanAction.map((tool) => (
            <ToolRow key={tool.toolCallId} tool={tool} />
          ))}
        </ul>
      ) : null}
      {settled.length > 0 ? (
        <details className="group rounded-lg border border-border bg-card/50">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-2.5 text-xs font-medium text-muted-foreground">
            <CircleDashed aria-hidden="true" className="size-3.5" />
            {settled.length === 1 ? "1 step" : `${settled.length} steps`}
            <ChevronDown
              aria-hidden="true"
              className="ml-auto size-3.5 transition-transform group-open:rotate-180"
            />
          </summary>
          <ul className="border-t border-border px-2.5">
            {settled.map((tool) => (
              <ToolRow key={tool.toolCallId} tool={tool} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
