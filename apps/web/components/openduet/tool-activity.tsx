"use client";

import type { ToolCallPart } from "@edapex/contracts";
import { CircleDashed } from "lucide-react";

import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceTitle
} from "@edapex/ui/components/trace";
import { ToolCall } from "@edapex/ui/components/tool-call";

interface ToolActivityProps {
  readonly tools: readonly ToolCallPart[];
}

function call(tool: ToolCallPart) {
  return (
    <ToolCall
      detail={tool.detail}
      key={tool.toolCallId}
      name={tool.name}
      status={tool.status}
      summary={tool.summary}
    />
  );
}

/**
 * Tool calls as a trace.
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
    <Trace className="gap-1.5">
      {humanAction.length > 0 ? (
        <div className="flex flex-col">{humanAction.map(call)}</div>
      ) : null}

      {settled.length > 0 ? (
        <TraceCollapsible>
          <TraceCollapsibleTrigger className="min-h-11 px-1">
            <TraceIcon>
              <CircleDashed className={failed > 0 ? "text-destructive" : undefined} />
            </TraceIcon>
            <TraceTitle className="shrink-0 font-medium text-foreground">
              {settled.length === 1 ? "1 step" : `${settled.length} steps`}
            </TraceTitle>
            {preview.length > 0 ? (
              <TraceDescription className="truncate">
                · {preview}
                {settled.length > 2 ? "…" : ""}
              </TraceDescription>
            ) : null}
            {failed > 0 ? (
              <TraceDescription className="rounded-full bg-destructive/15 px-1.5 text-destructive">
                {failed} failed
              </TraceDescription>
            ) : null}
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent>{settled.map(call)}</TraceCollapsibleContent>
        </TraceCollapsible>
      ) : null}
    </Trace>
  );
}
