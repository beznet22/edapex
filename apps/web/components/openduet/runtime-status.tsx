"use client";

import type { WorkspaceRunState } from "@edapex/contracts";

import { cn } from "@/lib/utils";

const LABELS: Record<WorkspaceRunState, string> = {
  restoring: "Restoring",
  history_unavailable: "History unavailable",
  idle: "Live",
  thinking: "Thinking",
  following: "Following",
  tool_running: "Working",
  waiting_for_person: "Waiting for you",
  completed: "Complete",
  stopped: "Stopped",
  error: "Error"
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
      aria-label={connected ? `Runtime ${LABELS[state].toLowerCase()}` : "Runtime offline"}
      className={cn(
        "inline-flex min-h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold tracking-wide",
        !connected && "border-border bg-muted/50 text-muted-foreground",
        connected && waiting && "border-primary/40 bg-primary/10 text-primary",
        connected && error && "border-destructive/40 bg-destructive/10 text-destructive",
        connected &&
          !waiting &&
          !error &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
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
          connected && !waiting && !error && "bg-emerald-400"
        )}
      />
      {connected ? LABELS[state] : "Runtime offline"}
    </span>
  );
}
