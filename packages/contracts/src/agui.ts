import type { JsonValue } from "./json";

/**
 * AG-UI is the agent transport. It is not OpenUI: OpenUI is a generated-surface
 * payload carried inside a chat `SurfacePart`.
 */
export const AG_UI_EVENT_TYPES = [
  "RUN_STARTED",
  "RUN_FINISHED",
  "RUN_ERROR",
  "STEP_STARTED",
  "STEP_FINISHED",
  "TEXT_MESSAGE_START",
  "TEXT_MESSAGE_CONTENT",
  "TEXT_MESSAGE_END",
  "TOOL_CALL_START",
  "TOOL_CALL_ARGS",
  "TOOL_CALL_END",
  "STATE_SNAPSHOT",
  "STATE_DELTA",
  "MESSAGES_SNAPSHOT",
  "RAW",
  "CUSTOM"
] as const;

export type AgUiEventType = (typeof AG_UI_EVENT_TYPES)[number];

export interface RunStartedEvent {
  readonly type: "RUN_STARTED";
  readonly threadId: string;
  readonly runId: string;
}

export interface RunFinishedEvent {
  readonly type: "RUN_FINISHED";
  readonly threadId: string;
  readonly runId: string;
}

export interface RunErrorEvent {
  readonly type: "RUN_ERROR";
  readonly message: string;
  readonly code?: string | null;
}

export interface StepStartedEvent {
  readonly type: "STEP_STARTED";
  readonly stepName: string;
}

export interface StepFinishedEvent {
  readonly type: "STEP_FINISHED";
  readonly stepName: string;
}

export interface TextMessageStartEvent {
  readonly type: "TEXT_MESSAGE_START";
  readonly messageId: string;
}

export interface TextMessageContentEvent {
  readonly type: "TEXT_MESSAGE_CONTENT";
  readonly messageId: string;
  readonly delta: string;
}

export interface TextMessageEndEvent {
  readonly type: "TEXT_MESSAGE_END";
  readonly messageId: string;
}

export interface ToolCallStartEvent {
  readonly type: "TOOL_CALL_START";
  readonly toolCallId: string;
  readonly toolCallName: string;
}

export interface ToolCallArgsEvent {
  readonly type: "TOOL_CALL_ARGS";
  readonly toolCallId: string;
  readonly delta: string;
}

export interface ToolCallEndEvent {
  readonly type: "TOOL_CALL_END";
  readonly toolCallId: string;
}

export interface StateSnapshotEvent {
  readonly type: "STATE_SNAPSHOT";
  readonly snapshot: JsonValue;
}

export interface StateDeltaEvent {
  readonly type: "STATE_DELTA";
  readonly delta: readonly JsonValue[];
}

export interface MessagesSnapshotEvent {
  readonly type: "MESSAGES_SNAPSHOT";
  readonly messages: readonly JsonValue[];
}

export interface RawEvent {
  readonly type: "RAW";
  readonly event: JsonValue;
}

export interface CustomEvent {
  readonly type: "CUSTOM";
  readonly name: string;
  readonly value: JsonValue;
}

export type AgUiEvent =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | StepStartedEvent
  | StepFinishedEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | MessagesSnapshotEvent
  | RawEvent
  | CustomEvent;

const EVENT_TYPES = new Set<string>(AG_UI_EVENT_TYPES);

export function isAgUiEvent(value: unknown): value is AgUiEvent {
  if (value === null || typeof value !== "object") return false;
  const type = (value as { readonly type?: unknown }).type;
  return typeof type === "string" && EVENT_TYPES.has(type);
}
