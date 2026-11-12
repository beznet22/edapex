import { z } from "zod";

import { CAPABILITY_RISKS } from "./capabilities";
import { CAPABILITY_ERROR_CODES, type CapabilityError } from "./platform";
import { jsonValueSchema, type JsonValue } from "./json";

export const AGENT_CONTRACT_VERSION = 1 as const;

export const APPROVAL_DECISIONS = [
  "allow_once",
  "allow_for_session",
  "deny",
  "abort"
] as const;

export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const DYNAMIC_TOOL_NAMES = [
  "web_search",
  "web_fetch",
  "ocr_extract"
] as const;

export type DynamicToolName = (typeof DYNAMIC_TOOL_NAMES)[number];

export const TOOL_COMPLETION_STATUSES = [
  "completed",
  "failed",
  "blocked",
  "declined",
  "refused"
] as const;

export type ToolCompletionStatus = (typeof TOOL_COMPLETION_STATUSES)[number];

export const TURN_COMPLETION_STATUSES = [
  "completed",
  "stopped",
  "error"
] as const;

export type TurnCompletionStatus = (typeof TURN_COMPLETION_STATUSES)[number];

export const agentErrorSchema = z
  .object({
    code: z.enum(CAPABILITY_ERROR_CODES),
    message: z.string().min(1),
    retryable: z.boolean()
  })
  .strict();

export const dynamicToolSpecSchema = z
  .object({
    name: z.enum(DYNAMIC_TOOL_NAMES),
    description: z.string().min(1),
    inputSchema: jsonValueSchema
  })
  .strict();

export type DynamicToolSpec = z.infer<typeof dynamicToolSpecSchema>;

export const dynamicToolCallSchema = z
  .object({
    callId: z.string().min(1),
    tool: z.enum(DYNAMIC_TOOL_NAMES),
    arguments: jsonValueSchema
  })
  .strict();

export const dynamicToolContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z.object({ type: z.literal("image"), imageUrl: z.string() }).strict()
]);

export const dynamicToolResultSchema = z
  .object({
    success: z.boolean(),
    content: z.array(dynamicToolContentSchema),
    error: agentErrorSchema.nullable()
  })
  .strict();

const connectedEvent = z
  .object({
    type: z.literal("connected"),
    threadId: z.string().nullable()
  })
  .strict();

const turnStartedEvent = z
  .object({
    type: z.literal("turn_started"),
    threadId: z.string().min(1),
    turnId: z.string().min(1)
  })
  .strict();

const messageDeltaEvent = z
  .object({
    type: z.literal("message_delta"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    itemId: z.string().min(1),
    delta: z.string()
  })
  .strict();

const reasoningDeltaEvent = z
  .object({
    type: z.literal("reasoning_delta"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    itemId: z.string().min(1),
    delta: z.string()
  })
  .strict();

const toolStartedEvent = z
  .object({
    type: z.literal("tool_started"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    summary: z.string()
  })
  .strict();

const toolCompletedEvent = z
  .object({
    type: z.literal("tool_completed"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    toolCallId: z.string().min(1),
    name: z.string().min(1),
    status: z.enum(TOOL_COMPLETION_STATUSES),
    detail: z.string().nullable()
  })
  .strict();

const approvalRequestedEvent = z
  .object({
    type: z.literal("approval_requested"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    approvalRequestId: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    risk: z.enum(CAPABILITY_RISKS),
    decisions: z.array(z.enum(APPROVAL_DECISIONS)).min(1)
  })
  .strict();

const approvalResolvedEvent = z
  .object({
    type: z.literal("approval_resolved"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    approvalRequestId: z.string().min(1),
    decision: z.enum(APPROVAL_DECISIONS)
  })
  .strict();

const turnCompletedEvent = z
  .object({
    type: z.literal("turn_completed"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    status: z.enum(TURN_COMPLETION_STATUSES)
  })
  .strict();

const errorEvent = z
  .object({
    type: z.literal("error"),
    threadId: z.string().nullable(),
    turnId: z.string().nullable(),
    error: agentErrorSchema
  })
  .strict();

const interruptedEvent = z
  .object({
    type: z.literal("interrupted"),
    threadId: z.string().min(1),
    turnId: z.string().min(1),
    reason: z.string()
  })
  .strict();

export const agentEventSchema = z.discriminatedUnion("type", [
  connectedEvent,
  turnStartedEvent,
  messageDeltaEvent,
  reasoningDeltaEvent,
  toolStartedEvent,
  toolCompletedEvent,
  approvalRequestedEvent,
  approvalResolvedEvent,
  turnCompletedEvent,
  errorEvent,
  interruptedEvent
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;

export interface AgentError extends CapabilityError {}

export interface AgentStatus {
  readonly connected: boolean;
  readonly threadId: string | null;
  readonly model: string;
  readonly mobileSafeTools: boolean;
}

export interface AgentConnectSettings {
  readonly workspaceId: string;
  readonly model: string;
  readonly mobileSafeTools: boolean;
}

export interface AgentTurnInput {
  readonly threadId: string;
  readonly text: string;
  readonly attachmentCaptureIds: readonly string[];
}

export interface DynamicToolCall {
  readonly callId: string;
  readonly tool: DynamicToolName;
  readonly arguments: JsonValue;
}

export interface DynamicToolResult {
  readonly success: boolean;
  readonly content: readonly DynamicToolContent[];
  readonly error: AgentError | null;
}

export type DynamicToolContent =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "image"; readonly imageUrl: string };

export function isAgentEvent(value: unknown): value is AgentEvent {
  return agentEventSchema.safeParse(value).success;
}
