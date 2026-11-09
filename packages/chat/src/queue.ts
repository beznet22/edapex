import type { QueuedMessage } from "@edapex/contracts";

export const MAX_QUEUED_MESSAGES = 20;

export interface ChatQueueState {
  readonly queued: readonly QueuedMessage[];
}

export interface QueueDrain {
  readonly messages: readonly QueuedMessage[];
  readonly text: string;
  readonly attachmentIds: readonly string[];
}

export type QueueAction =
  | { readonly type: "park"; readonly message: QueuedMessage }
  | { readonly type: "submit"; readonly message: QueuedMessage; readonly busy: boolean }
  | { readonly type: "settle" }
  | { readonly type: "restore"; readonly messages: readonly QueuedMessage[] }
  | { readonly type: "remove"; readonly id: string };

export interface QueueResult {
  readonly state: ChatQueueState;
  readonly drain: QueueDrain | null;
}

export const emptyQueue = (): ChatQueueState => ({ queued: [] });

const bounded = (messages: readonly QueuedMessage[]): readonly QueuedMessage[] =>
  messages.slice(0, MAX_QUEUED_MESSAGES);

export function drainOf(messages: readonly QueuedMessage[]): QueueDrain {
  const text = messages
    .map((message) => message.text.trim())
    .filter((value) => value.length > 0)
    .join("\n\n");
  return {
    messages,
    text,
    attachmentIds: messages.flatMap((message) => message.attachmentIds)
  };
}

export function reduceQueue(state: ChatQueueState, action: QueueAction): QueueResult {
  switch (action.type) {
    case "park":
      return {
        state: { queued: bounded([...state.queued, action.message]) },
        drain: null
      };
    case "submit":
      return action.busy
        ? {
            state: { queued: bounded([...state.queued, action.message]) },
            drain: null
          }
        : {
            state: { queued: state.queued },
            drain: drainOf([action.message])
          };
    case "settle": {
      if (state.queued.length === 0) {
        return { state, drain: null };
      }
      const messages = state.queued;
      return {
        state: { queued: [] },
        drain: drainOf(messages)
      };
    }
    case "restore":
      return {
        state: { queued: bounded([...action.messages, ...state.queued]) },
        drain: null
      };
    case "remove":
      return {
        state: { queued: state.queued.filter((message) => message.id !== action.id) },
        drain: null
      };
  }
}

export function queueCount(state: ChatQueueState): number {
  return state.queued.length;
}
