import { z } from "zod";

import { isModelAllowed, REQUEST_LIMITS } from "./policy";

/**
 * The request body, in OpenAI Chat Completions format.
 *
 * The caller is `cowork-api`, which forwards what the Rust core produced — and
 * the core already speaks this shape (`ProviderRequestWire`). Using the wire
 * format natively means there is no translation layer to keep in sync, and any
 * OpenAI SDK can exercise the router directly during development.
 *
 * Unknown top-level keys are **dropped, not rejected**: real OpenAI clients send
 * `seed`, `logprobs`, `presence_penalty` and others, and refusing those would
 * make the endpoint not actually compatible. Dropping is still safe because the
 * body sent upstream is constructed from the parsed fields only — nothing
 * unvalidated is ever forwarded.
 */
const messageSchema = z
  .object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.string().nullable().optional(),
    name: z.string().optional(),
    tool_call_id: z.string().optional(),
    tool_calls: z
      .array(
        z.object({
          id: z.string().min(1),
          type: z.literal("function").optional(),
          function: z.object({
            name: z.string().min(1),
            arguments: z.string()
          })
        })
      )
      .optional()
  })
  .passthrough();

export const chatRequestSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(messageSchema).min(1).max(REQUEST_LIMITS.maxMessages),
    tools: z.array(z.unknown()).max(REQUEST_LIMITS.maxTools).optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    stream: z.boolean().optional()
  })
  .passthrough();

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export interface ValidationFailure {
  readonly code: "invalid_input" | "model_not_allowed";
  readonly message: string;
}

/**
 * Enforce the model allowlist and the input caps.
 *
 * Returns a failure instead of throwing so the route can answer with the error
 * code the agent contract already publishes.
 */
export function validateChatRequest(request: ChatRequest): ValidationFailure | null {
  if (!isModelAllowed(request.model)) {
    return {
      code: "model_not_allowed",
      message: `${request.model} is not available to this workspace.`
    };
  }

  let characters = 0;
  for (const message of request.messages) {
    characters += message.content?.length ?? 0;
    for (const call of message.tool_calls ?? []) {
      characters += call.function.arguments.length;
    }
  }
  if (characters > REQUEST_LIMITS.maxInputChars) {
    return {
      code: "invalid_input",
      message: `The conversation exceeds ${REQUEST_LIMITS.maxInputChars} characters. Start a new thread.`
    };
  }

  return null;
}

/**
 * Build the body sent upstream.
 *
 * Constructed field by field from validated values, so a caller-supplied key can
 * never reach the provider even though the schema tolerates it. Streaming is
 * forced on: the core consumes SSE, and a buffered response would break the
 * workspace UI.
 */
export function toProviderBody(
  request: ChatRequest,
  model: string
): Record<string, unknown> {
  return {
    model,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: REQUEST_LIMITS.maxOutputTokens,
    messages: request.messages.map((message) => ({
      role: message.role,
      content: message.content ?? null,
      ...(message.name !== undefined ? { name: message.name } : {}),
      ...(message.tool_call_id !== undefined ? { tool_call_id: message.tool_call_id } : {}),
      ...(message.tool_calls !== undefined && message.tool_calls.length > 0
        ? {
            tool_calls: message.tool_calls.map((call) => ({
              id: call.id,
              type: "function" as const,
              function: {
                name: call.function.name,
                arguments: call.function.arguments
              }
            }))
          }
        : {})
    })),
    ...(request.tools !== undefined && request.tools.length > 0
      ? { tools: request.tools }
      : {}),
    ...(request.temperature !== undefined && request.temperature !== null
      ? { temperature: request.temperature }
      : {})
  };
}

/** The OpenAI-shaped error body clients already know how to read. */
export function errorBody(
  message: string,
  code: string,
  type: "invalid_request_error" | "authentication_error" | "server_error"
): Record<string, unknown> {
  return { error: { message, type, code } };
}
