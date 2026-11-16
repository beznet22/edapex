import {
  startTransportTurn,
  type AgentConnectSettings,
  type AgentTransport,
  type ConnectedTransport,
  type ConnectHandlers
} from "@edapex/host/agent/transport";

import { agentHost, nativeIsDefault } from "@/lib/agent-host";

/**
 * The web app's transport selection.
 *
 * This is policy, not seam. `@edapex/host/agent` takes an `AgentTransport` and calls it;
 * *which* transport a host uses is an app decision, and it lives here. That split is what
 * lets the Android app reuse the adapter without inheriting a `next/*` import or a cookie.
 *
 * The two branches differ only in who owns the transport — a `tauri::ipc::Channel` or the
 * wasm-bindgen bridge — and both register the same three callbacks. The returned
 * `disconnect` is what the adapter calls on `stop`; the native path interrupts rather than
 * holding a client, because its transport is process state rather than an object.
 */
const webTransport: AgentTransport = {
  kind: "web",
  async connect(
    settings: AgentConnectSettings,
    handlers: ConnectHandlers
  ): Promise<ConnectedTransport> {
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
  },
  startTurn: startTransportTurn
};

const nativeTransport: AgentTransport = {
  kind: "native",
  async connect(
    settings: AgentConnectSettings,
    handlers: ConnectHandlers
  ): Promise<ConnectedTransport> {
    // Dynamic so a browser bundle never resolves the Tauri API.
    const { connectNative } = await import("@edapex/host/agent/native");
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
  },
  startTurn: startTransportTurn
};

/**
 * Which transport this host uses.
 *
 * Desktop and mobile run the agent natively — that is the architecture in `docs/system.md`,
 * not an option. The WASM branch remains because a browser tab has no native host, and the
 * env override exists only until the native default has been verified on a device.
 */
export function selectAgentTransport(): AgentTransport {
  if (agentHost() === "native" && nativeIsDefault()) return nativeTransport;
  return webTransport;
}
