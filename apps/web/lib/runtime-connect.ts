import type { ConnectedNativeRuntime } from "@/lib/native-runtime";
import type { NativeAgentClient, NativeAgentSettings } from "@/lib/native-agent";

import { agentHost, nativeIsDefault } from "@/lib/agent-host";

/**
 * Picks a host and connects it.
 *
 * The two branches differ only in who owns the transport — a `tauri::ipc::Channel` or the
 * wasm-bindgen bridge — and both register the same three callbacks. Keeping them inline in
 * the adapter meant the same thirteen-line handler object appeared twice, and the next
 * transport would have made it three.
 *
 * The returned `disconnect` is what the adapter calls on `stop`; the native path returns a
 * function that interrupts rather than a client to hold, because its transport is process
 * state rather than an object.
 */
export interface AgentEventShape {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface AgentToolCall {
  readonly callId: string;
  readonly tool: string;
  readonly arguments: unknown;
}

export interface AgentApprovalRequest {
  readonly approvalRequestId: string;
  readonly title: string;
  readonly description: string;
  readonly risk: "read" | "write" | "destructive";
}

export interface ConnectHandlers {
  readonly onEvent: (event: AgentEventShape) => void;
  readonly onTool: (call: AgentToolCall) => Promise<{ success: boolean; text: string }>;
  readonly onApproval: (request: AgentApprovalRequest) => Promise<boolean>;
}

export interface ConnectedTransport {
  /** Null on the native path, which has no client object to hold. */
  readonly client: NativeAgentClient | null;
  /** Present on the native path, where the session is the transport handle. */
  readonly connected?: ConnectedNativeRuntime;
  /** Closes the transport. Idempotent. */
  readonly disconnect: () => void;
}

export async function connectTransport(
  settings: NativeAgentSettings,
  handlers: ConnectHandlers
): Promise<ConnectedTransport> {
  /*
   * Desktop and mobile run the agent natively. The WASM path remains the default until
   * the native transport can be verified on a real host (see
   * `specs/50-native-agent-path.md`), but the branch exists so the rule is true in code
   * rather than aspirational.
   */
  if (agentHost() === "native" && nativeIsDefault()) {
    const { connectNative } = await import("@/lib/native-runtime");
    const session = await connectNative(settings, {
      onEvent: handlers.onEvent,
      onTool: handlers.onTool,
      onApproval: handlers.onApproval
    });
    return {
      client: null,
      connected: session,
      disconnect: () => {
        void session.close();
      }
    };
  }

  // Imported statically: the wasm path is the default and lazy-loading it would only move
  // the cost from first paint to first message.
  const { NativeAgentClient } = await import("@/lib/native-agent");
  const client = new NativeAgentClient(settings, {
    onEvent: handlers.onEvent,
    onTool: handlers.onTool,
    onApproval: handlers.onApproval
  });
  await client.connect();

  return {
    client,
    disconnect: () => {
      void client.stop();
    }
  };
}

/**
 * Starts a turn on whichever transport this is.
 *
 * The native session takes text and returns a turn id; the wasm client takes text and
 * returns nothing useful. Both are "start a turn", so the adapter should not branch on
 * which — that is the one thing about a transport the adapter still knew.
 */
export async function startTransportTurn(
  transport: ConnectedTransport,
  text: string
): Promise<void> {
  if (transport.connected !== undefined) {
    await transport.connected.send(text);
    return;
  }
  await transport.client?.startTurn(text);
}
