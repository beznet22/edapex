/**
 * The host seam.
 *
 * `crates/agent` is the agent runtime on every host. What varies is the **transport**:
 * the browser calls `fetch` with a cookie, the Tauri host calls `reqwest` with a bearer
 * token from the OS keychain. `docs/system.md` calls this "transport (host-injected)", and
 * this module is where that injection is typed.
 *
 * Nothing here imports a host API. `./native` is the only module in the package that
 * touches `@tauri-apps/api`, and only a native host resolves it.
 */
import type { AgentEvent } from "@edapex/contracts";

/** Mirrors `AgentConnectSettings` in `crates/agent/src/protocol.rs`. */
export interface AgentConnectSettings {
  readonly workspaceId: string;
  readonly model: string;
  /** Caps the tool surface on a phone. Set by the host, never by the model. */
  readonly mobileSafeTools: boolean;
}

export interface AgentToolCall {
  readonly callId: string;
  readonly tool: string;
  readonly arguments: unknown;
}

export interface AgentToolResult {
  readonly success: boolean;
  readonly text: string;
}

export interface AgentApprovalRequest {
  readonly approvalRequestId: string;
  readonly title: string;
  readonly description: string;
  readonly risk: "read" | "write" | "destructive";
}

export interface ConnectHandlers {
  readonly onEvent: (event: AgentEvent) => void;
  readonly onTool: (call: AgentToolCall) => Promise<AgentToolResult>;
  readonly onApproval: (request: AgentApprovalRequest) => Promise<boolean>;
}

/**
 * What a caller can do with a connected transport.
 *
 * Deliberately structural rather than a union of the two concrete clients: the adapter
 * needs `executeTool`, the turn start needs `send`, and neither should have to know which
 * host produced the object.
 */
export interface TransportClient {
  readonly startTurn: (text: string) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly executeTool: (call: AgentToolCall) => Promise<AgentToolResult>;
}

export interface ConnectedSession {
  readonly send: (text: string) => Promise<string>;
  readonly stop: (turnId: string) => Promise<void>;
  readonly close: () => Promise<void>;
}

export interface ConnectedTransport {
  /** Present on a transport that hands back a client, absent on the native session path. */
  readonly client: TransportClient | null;
  /** Present on the native path, where the session *is* the transport handle. */
  readonly connected?: ConnectedSession;
  /** Closes the transport. Idempotent. */
  readonly disconnect: () => void;
}

/**
 * The one seam a surface sees.
 *
 * `kind` is not decoration: `describeHost` reports it, and a bug report that says which
 * transport ran is the difference between a diagnosis and a guess.
 */
export interface AgentTransport {
  readonly kind: "web" | "native";
  readonly connect: (
    settings: AgentConnectSettings,
    handlers: ConnectHandlers
  ) => Promise<ConnectedTransport>;
  readonly startTurn: (transport: ConnectedTransport, text: string) => Promise<void>;
}

/**
 * Starts a turn on whichever transport this is.
 *
 * The native session takes text and returns a turn id; the browser client takes text and
 * returns nothing useful. Both mean "start a turn", so the adapter should not branch on
 * which — that is the only thing about a transport the adapter still knew.
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
