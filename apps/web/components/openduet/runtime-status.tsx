"use client";

import type { WorkspaceRunState } from "@edapex/contracts";

import { cn } from "@/lib/utils";

/**
 * Visible labels. Deliberately short: this sits in the header beside the theme control and
 * a Set up button, and "Runtime offline" plus "History unavailable" pushed the row wider
 * than the surface it describes.
 *
 * Nothing is lost — the full sentence lives in the accessible name below, so a screen
 * reader still hears "Runtime offline" while the pill reads "Offline".
 */
const LABELS: Record<WorkspaceRunState, string> = {
  restoring: "Restoring",
  history_unavailable: "No history",
  idle: "Live",
  thinking: "Thinking",
  following: "Following",
  tool_running: "Working",
  waiting_for_person: "Waiting",
  completed: "Complete",
  stopped: "Stopped",
  error: "Error"
};

/** The spoken form, where there is room to be specific. */
const ACCESSIBLE: Record<WorkspaceRunState, string> = {
  restoring: "Runtime restoring",
  history_unavailable: "Conversation history unavailable",
  idle: "Runtime live",
  thinking: "Runtime thinking",
  following: "Runtime following",
  tool_running: "Runtime working",
  waiting_for_person: "Runtime waiting for you",
  completed: "Runtime complete",
  stopped: "Runtime stopped",
  error: "Runtime error"
};

interface RuntimeStatusProps {
  readonly connected: boolean;
  readonly state: WorkspaceRunState;
}

export function RuntimeStatus({ connected, state }: RuntimeStatusProps) {
  const waiting = state === "waiting_for_person";
  const error = state === "history_unavailable" || state === "error";
  return (
    <span
      aria-label={connected ? ACCESSIBLE[state] : "Runtime offline"}
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold tracking-wide",
        !connected && "border-border bg-muted/50 text-muted-foreground",
        connected && waiting && "border-primary/40 bg-primary/10 text-primary",
        connected && error && "border-destructive/40 bg-destructive/10 text-destructive",
        connected &&
          !waiting &&
          !error &&
          "border-success/40 bg-success/10 text-success"
      )}
      role="status"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          !connected && "bg-muted-foreground",
          connected && waiting && "bg-primary",
          connected && error && "bg-destructive",
          connected && !waiting && !error && "bg-success"
        )}
      />
      {connected ? LABELS[state] : "Offline"}
    </span>
  );
}
