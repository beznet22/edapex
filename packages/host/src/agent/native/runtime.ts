"use client";

/**
 * Native runtime connection.
 *
 * Ties the typed Tauri commands in `native-agent-tauri.ts` to the callback shape the
 * workspace adapter already speaks. Kept separate from `agent-runtime.ts` so the
 * native path is one small file that can be reviewed on its own, and so the dynamic
 * import in the adapter stays a single edge.
 *
 * Approvals are **server-authoritative** on this path too: the decision goes back
 * through `agent_approval_response`, which the Rust side awaits. Nothing here
 * auto-approves.
 */

import type { AgentEvent } from "@edapex/contracts";

import {
  agentApprovalResponse,
  agentAttach,
  agentClose,
  agentConnect,
  agentThreadStart,
  agentTurnInterrupt,
  agentTurnStart,
  openChannel,
  type NativeChannel
} from "./transport";
import type { AgentConnectSettings } from "../transport";

export interface NativeCallbacks {
  readonly onEvent: (event: AgentEvent) => void;
  readonly onTool: (call: {
    readonly callId: string;
    readonly tool: string;
    readonly arguments: unknown;
  }) => Promise<{ readonly success: boolean; readonly text: string }>;
  readonly onApproval: (request: {
    readonly approvalRequestId: string;
    readonly title: string;
    readonly description: string;
    readonly risk: "read" | "write" | "destructive";
  }) => Promise<boolean>;
}

export interface ConnectedNativeRuntime {
  readonly threadId: string;
  send: (text: string) => Promise<string>;
  stop: (turnId: string) => Promise<void>;
  close: () => Promise<void>;
}

let connection: { channel: NativeChannel; threadId: string } | null = null;

/**
 * Connects the native agent.
 *
 * A `Channel` is opened first and handed to `agent_connect`, so events that arrive
 * during connection are not dropped — the Rust side takes the channel as a command
 * argument rather than creating one it must later replace.
 */
export async function connectNative(
  settings: AgentConnectSettings,
  callbacks: NativeCallbacks
): Promise<ConnectedNativeRuntime> {
  const channel = await openChannel(callbacks.onEvent);

  await agentConnect(
    {
      workspaceId: settings.workspaceId,
      model: settings.model,
      mobileSafeTools: settings.mobileSafeTools
    },
    channel
  );

  const threadId = await agentThreadStart();
  connection = { channel, threadId };

  return {
    threadId,

    async send(text: string): Promise<string> {
      // Tool execution and approval stay client-side on this path: the core awaits
      // the host's promise, and the host is this function's caller.
      return agentTurnStart({ threadId, text, attachmentCaptureIds: [] });
    },

    async stop(turnId: string): Promise<void> {
      await agentTurnInterrupt(threadId, turnId);
    },

    async close(): Promise<void> {
      await agentClose();
      channel.close();
      connection = null;
    }
  };
}

/**
 * Re-attaches after a reload.
 *
 * The Rust side swaps the channel *before* replaying, so events emitted between the
 * reload and the attach are not lost. The WASM host cannot do this: its state is
 * per-page, which is one concrete reason the native path is the right default on a
 * device that can run it.
 */
export async function reattachNative(
  sinceSeq: number,
  callbacks: NativeCallbacks
): Promise<{ channel: NativeChannel; replayedThrough: number }> {
  const channel = await openChannel(callbacks.onEvent);
  const replayedThrough = await agentAttach(sinceSeq, channel);
  return { channel, replayedThrough };
}

/** Answers a pending approval. Rejects nothing silently: the Rust side is awaiting. */
export async function respondToApproval(
  approvalRequestId: string,
  decision: "allow_once" | "allow_for_session" | "deny" | "abort"
): Promise<void> {
  await agentApprovalResponse(approvalRequestId, decision);
}

/** True once a native connection exists in this page. */
export function isNativeConnected(): boolean {
  return connection !== null;
}
