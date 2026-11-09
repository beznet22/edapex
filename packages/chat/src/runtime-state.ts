import type { ChatMessage, WorkspaceTurnView } from "@edapex/contracts";

import {
  emptyQueue,
  reduceQueue,
  type ChatQueueState,
  type QueueAction,
  type QueueDrain
} from "./queue";
import { applyTurnEvent, initialTurn, type TurnEvent } from "./turn";

export interface WorkspaceRuntimeState {
  readonly turn: WorkspaceTurnView;
  readonly messages: readonly ChatMessage[];
  readonly queue: ChatQueueState;
}

export type RuntimeEvent =
  | { readonly type: "turn"; readonly event: TurnEvent }
  | { readonly type: "queue"; readonly action: QueueAction }
  | { readonly type: "message"; readonly message: ChatMessage }
  | { readonly type: "history"; readonly messages: readonly ChatMessage[] }
  | { readonly type: "clear-messages" };

export interface RuntimeResult {
  readonly state: WorkspaceRuntimeState;
  readonly drain: QueueDrain | null;
}

export const createRuntimeState = (): WorkspaceRuntimeState => ({
  turn: initialTurn(),
  messages: [],
  queue: emptyQueue()
});

const withQueueCounts = (
  state: WorkspaceRuntimeState,
  queue: ChatQueueState
): WorkspaceRuntimeState => ({
  ...state,
  queue,
  turn: {
    ...state.turn,
    queueCount: queue.queued.length
  }
});

export function reduceRuntime(
  state: WorkspaceRuntimeState,
  event: RuntimeEvent
): RuntimeResult {
  switch (event.type) {
    case "turn":
      return {
        state: { ...state, turn: applyTurnEvent(state.turn, event.event) },
        drain: null
      };
    case "queue": {
      const result = reduceQueue(state.queue, event.action);
      return {
        state: withQueueCounts(state, result.state),
        drain: result.drain
      };
    }
    case "message":
      return {
        state: { ...state, messages: [...state.messages, event.message] },
        drain: null
      };
    case "history":
      return { state: { ...state, messages: event.messages }, drain: null };
    case "clear-messages":
      return { state: { ...state, messages: [] }, drain: null };
  }
}
