"use client";

import { Loader2 } from "lucide-react";

import type { WorkspaceRunState } from "@edapex/contracts";

import { cn } from "@/lib/utils";

/**
 * Runtime state, and — when there is no runtime — the control that starts one.
 *
 * These were two elements saying the same thing: an "Offline" pill beside a "Set up"
 * button, reading as two separate facts about the same absence. Merged, because the only
 * useful action when the runtime is offline *is* connecting it.
 *
 * Connected, the element is a passive `role="status"`: nothing to do, just state.
 */

/**
 * Visible labels, deliberately short — this sits in a 64px bar beside a theme control and
 * a document button.
 *
 * Nothing is lost: the full sentence is in `aria-label`, so a screen reader still hears
 * "Runtime offline" while the pill reads "Offline".
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

export interface RuntimeStatusProps {
  readonly connected: boolean;
  readonly state: WorkspaceRunState;
  /** Absent means the runtime cannot be started from here. */
  readonly onConnect?: (() => void) | undefined;
  readonly connecting?: boolean;
}

export function RuntimeStatus({
  connected,
  state,
  onConnect,
  connecting = false
}: RuntimeStatusProps) {
  const waiting = state === "waiting_for_person";
  const error = state === "history_unavailable" || state === "error";

  const dot = !connected
    ? "bg-muted-foreground"
    : waiting
      ? "bg-primary"
      : error
        ? "bg-destructive"
        : "bg-success";

  // Disconnected and startable: this is a button, not a badge.
  if (!connected && onConnect !== undefined) {
    return (
      <button
        aria-label={
          connecting ? "Connecting the runtime" : "Runtime offline. Set up the runtime."
        }
        className={cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[12px] font-semibold outline-none",
          "border-primary/35 bg-primary/10 text-primary transition-colors hover:bg-primary/15",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-60"
        )}
        disabled={connecting}
        onClick={onConnect}
        type="button"
      >
        {connecting ? (
          <Loader2 aria-hidden="true" className="size-3 animate-spin" />
        ) : (
          <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
        )}
        {connecting ? "Connecting" : "Offline · Set up"}
      </button>
    );
  }

  return (
    <span
      aria-label={connected ? ACCESSIBLE[state] : "Runtime offline"}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-semibold tracking-wide",
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
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      {connected ? LABELS[state] : "Offline"}
    </span>
  );
}
