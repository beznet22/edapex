import type { WorkspaceRunState, WorkspaceTurnView } from "@edapex/contracts";

export interface TurnQueueCounts {
  readonly queueCount: number;
  readonly serverQueueCount: number;
}

export type TurnEvent =
  | { readonly type: "restore_start" }
  | { readonly type: "restore_complete" }
  | { readonly type: "restore_unavailable" }
  | { readonly type: "run_started"; readonly local: boolean }
  | { readonly type: "tool_started" }
  | { readonly type: "tool_finished" }
  | { readonly type: "approval_requested" }
  | { readonly type: "approval_decided" }
  | { readonly type: "run_completed" }
  | { readonly type: "run_stopped" }
  | { readonly type: "run_failed" }
  | { readonly type: "seen"; readonly at: number }
  | { readonly type: "queue_changed"; readonly counts: TurnQueueCounts };

export const initialTurn = (): WorkspaceTurnView => ({
  state: "restoring",
  stoppable: false,
  queueCount: 0,
  serverQueueCount: 0,
  lastSeenAt: null
});

const stoppable = (state: WorkspaceRunState): boolean =>
  state === "thinking" || state === "tool_running";

const next = (state: WorkspaceRunState, current: WorkspaceTurnView): WorkspaceTurnView => ({
  ...current,
  state,
  stoppable: stoppable(state)
});

export function applyTurnEvent(
  current: WorkspaceTurnView,
  event: TurnEvent
): WorkspaceTurnView {
  switch (event.type) {
    case "restore_start":
      return next("restoring", current);
    case "restore_complete":
      return next("idle", current);
    case "restore_unavailable":
      return next("history_unavailable", current);
    case "run_started":
      return next(event.local ? "thinking" : "following", current);
    case "tool_started":
      return next("tool_running", current);
    case "tool_finished":
      return next("thinking", current);
    case "approval_requested":
      return next("waiting_for_person", current);
    case "approval_decided":
      return next("thinking", current);
    case "run_completed":
      return next("completed", current);
    case "run_stopped":
      return next("stopped", current);
    case "run_failed":
      return next("error", current);
    case "seen":
      return { ...current, lastSeenAt: event.at };
    case "queue_changed":
      return {
        ...current,
        queueCount: event.counts.queueCount,
        serverQueueCount: event.counts.serverQueueCount
      };
  }
}

export function canStop(turn: WorkspaceTurnView): boolean {
  return turn.stoppable;
}
