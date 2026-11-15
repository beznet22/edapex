import type { WorkspaceRuntimeState } from "@edapex/chat";
import type { ChatMessage } from "@edapex/contracts";

/**
 * Maps an agent event onto a turn state.
 *
 * Pure: it answers "what turn state does this event imply", and nothing about how the
 * adapter stores it. That separation matters because the mapping is the part with rules
 * worth reading — `waiting_for_person` is not a failure, `interrupted` is `stopped` rather
 * than `error` — and it was buried among buffer flushes and emit calls.
 *
 * A `null` result means the event does not change the turn (a text delta), so the caller
 * knows not to touch state for the hot path.
 */
export type TurnState = WorkspaceRuntimeState["turn"]["state"];

export type AgentEvent = { readonly type: string; readonly [key: string]: unknown };

export interface TurnTransition {
  readonly state: TurnState;
  readonly stoppable: boolean;
  /** Whether buffered streaming text must be written before the state change. */
  readonly flushFirst: boolean;
}

export function turnTransition(event: AgentEvent): TurnTransition | null {
  switch (event.type) {
    case "turn_started":
      return { state: "thinking", stoppable: true, flushFirst: false };
    case "message_delta":
      // Text deltas do not move the turn; the buffer handles them.
      return null;
    case "tool_started":
      return { state: "tool_running", stoppable: true, flushFirst: true };
    case "tool_completed":
      return { state: "following", stoppable: true, flushFirst: false };
    case "approval_requested":
      return { state: "waiting_for_person", stoppable: true, flushFirst: false };
    case "approval_resolved":
      return { state: "following", stoppable: true, flushFirst: false };
    case "turn_completed": {
      const status = String(event.status);
      return {
        state: status === "error" ? "error" : status === "stopped" ? "stopped" : "completed",
        stoppable: false,
        flushFirst: true
      };
    }
    case "interrupted":
      return { state: "stopped", stoppable: false, flushFirst: true };
    case "error":
      return { state: "error", stoppable: false, flushFirst: true };
    default:
      return null;
  }
}

/** Whether an event settles a turn for a caller waiting on `sendAndWait`. */
export function settlesTurn(state: TurnState): boolean {
  return state !== "thinking" && state !== "following" && state !== "tool_running";
}

/**
 * The approval card, as a message.
 *
 * Kept next to `turnTransition` because the two must agree: an approval is always paired
 * with `waiting_for_person`, and the pair was split across two files once and drifted —
 * the message appeared while the turn state stayed `following`.
 */
export function approvalMessage(request: AgentApproval): ChatMessage {
  return {
    id: `approval-${request.approvalRequestId}`,
    role: "assistant",
    createdAt: Date.now(),
    parts: [
      {
        kind: "approval",
        approvalRequestId: request.approvalRequestId,
        status: "pending",
        title: request.title,
        description: request.description,
        risk: request.risk
      }
    ]
  };
}

export function withPendingApproval(
  state: WorkspaceRuntimeState,
  request: AgentApproval
): WorkspaceRuntimeState {
  return {
    ...state,
    messages: [...state.messages, approvalMessage(request)],
    turn: { ...state.turn, state: "waiting_for_person", stoppable: true }
  };
}

/** Resolves an approval card to its outcome, leaving every other message untouched. */
export function withApprovalDecision(
  state: WorkspaceRuntimeState,
  messageId: string,
  approvalRequestId: string,
  decision: "allowed" | "declined"
): WorkspaceRuntimeState {
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === messageId
        ? {
            ...message,
            parts: message.parts.map((part) =>
              part.kind === "approval" && part.approvalRequestId === approvalRequestId
                ? { ...part, status: decision }
                : part
            )
          }
        : message
    )
  };
}

export interface AgentApproval {
  readonly approvalRequestId: string;
  readonly title: string;
  readonly description: string;
  readonly risk: "read" | "write" | "destructive";
}
