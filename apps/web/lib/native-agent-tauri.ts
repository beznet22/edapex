/**
 * Typed wrappers for the native agent commands.
 *
 * Desktop and mobile run the agent **natively**. The WebAssembly runtime is the web
 * delivery mechanism only; a host that can run native code uses `crates/agent`
 * directly. See `specs/50-native-agent-path.md`.
 *
 * The Rust side already emits the same JSON event shape as the WASM bridge, so the
 * two hosts converge on one contract and one validator.
 */

import { invokeCommand } from "./tauri";
import type { AgentEvent } from "@edapex/contracts";

/** Mirrors `AgentConnectSettings` in `crates/agent/src/protocol.rs`. */
export interface NativeConnectSettings {
  readonly workspaceId: string;
  readonly model: string;
  readonly mobileSafeTools: boolean;
}

/** Mirrors `AgentTurnInput`. */
export interface NativeTurnInput {
  readonly threadId: string;
  readonly text: string;
  readonly attachmentCaptureIds: readonly string[];
}

export interface NativeChannel {
  /** Releases the IPC channel. Safe to call more than once. */
  readonly close: () => void;
}

interface ChannelCtor {
  new (onMessage: (message: unknown) => void): NativeChannel;
}

/**
 * Loads Tauri's IPC `Channel`.
 *
 * A dynamic import keeps `@tauri-apps/api` out of the browser bundle: on the web this
 * module is never reached, and the bundler can still split it.
 */
async function channelFactory(): Promise<ChannelCtor> {
  const module = (await import("@tauri-apps/api/core")) as unknown as { Channel: ChannelCtor };
  return module.Channel;
}

/**
 * Subscribes to native agent events.
 *
 * The callback receives the **same** `AgentEvent` union the WASM bridge produces, so
 * a reducer written once works on both hosts. That is the reason the Rust side
 * serialises with serde rather than emitting a bespoke JS shape.
 */
export async function openChannel(
  onEvent: (event: AgentEvent) => void
): Promise<NativeChannel> {
  const Channel = await channelFactory();
  return new Channel((message) => {
    // The channel carries the serialised enum; validate at the boundary rather
    // than trusting the shape, because a host/contract drift here is silent.
    if (isAgentEvent(message)) onEvent(message);
  });
}

/** Connects the native agent and streams its events. */
export async function agentConnect(
  settings: NativeConnectSettings,
  channel: NativeChannel
): Promise<void> {
  return invokeCommand<void>("agent_connect", { settings, channel });
}

/** Re-subscribes after a reload, replaying from a sequence number. */
export async function agentAttach(
  sinceSeq: number,
  channel: NativeChannel
): Promise<number> {
  return invokeCommand<number>("agent_attach", { sinceSeq, channel });
}

export async function agentThreadStart(cwd: string | null = null): Promise<string> {
  const result = await invokeCommand<{ threadId: string }>("agent_thread_start", { cwd });
  return result.threadId;
}

export async function agentTurnStart(input: NativeTurnInput): Promise<string> {
  const result = await invokeCommand<{ turnId: string }>("agent_turn_start", { input });
  return result.turnId;
}

export async function agentTurnInterrupt(threadId: string, turnId: string): Promise<void> {
  return invokeCommand<void>("agent_turn_interrupt", { threadId, turnId });
}

export async function agentApprovalResponse(
  approvalRequestId: string,
  decision: "allow_once" | "allow_for_session" | "deny" | "abort"
): Promise<void> {
  return invokeCommand<void>("agent_approval_response", { approvalRequestId, decision });
}

export async function agentClose(): Promise<void> {
  return invokeCommand<void>("agent_close");
}

/**
 * Structural guard for the event union.
 *
 * Duplicated deliberately from the WASM client: the producer here is Rust over
 * `tauri::ipc`, a different transport from the wasm-bindgen callback, so a mismatch
 * between them is exactly what this catches.
 */
const REQUIRED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  connected: [],
  turn_started: ["threadId", "turnId"],
  message_delta: ["threadId", "turnId", "itemId", "delta"],
  reasoning_delta: ["threadId", "turnId", "itemId", "delta"],
  tool_started: ["threadId", "turnId", "toolCallId", "name", "summary"],
  tool_completed: ["threadId", "turnId", "toolCallId", "name", "status"],
  approval_requested: [
    "threadId",
    "turnId",
    "approvalRequestId",
    "title",
    "description",
    "risk",
    "decisions"
  ],
  approval_resolved: ["threadId", "turnId", "approvalRequestId", "decision"],
  turn_completed: ["threadId", "turnId", "status"],
  interrupted: ["threadId", "turnId", "reason"],
  error: ["error"]
};

export function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string") return false;

  const required = REQUIRED_FIELDS[type];
  if (required === undefined) return false;
  for (const field of required) {
    if (!(field in record)) return false;
  }
  if (type === "error") {
    const error = record.error;
    return typeof error === "object" && error !== null && "code" in error;
  }
  return true;
}
