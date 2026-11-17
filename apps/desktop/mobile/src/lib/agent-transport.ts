import type { AgentTransport } from "@edapex/host/agent/transport";
import { connectNative } from "@edapex/host/agent/native";
import { startTransportTurn } from "@edapex/host/agent/transport";

/**
 * The mobile host is always the native one.
 *
 * There is no browser branch and no WASM fallback here: an Android app that resolved the
 * web runtime would be the exact drift `docs/system.md` forbids, and a build that silently
 * fell back would look like it worked.
 */
export const nativeTransport: AgentTransport = {
  kind: "native",
  async connect(settings, handlers) {
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
