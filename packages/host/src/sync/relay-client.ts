import {
  sessionDeletionResultSchema,
  sessionLeaseResultSchema,
  sessionReleaseResultSchema,
  sessionSyncPullResultSchema,
  sessionSyncPushResultSchema,
  type SessionDeletionResult,
  type SessionLease,
  type SessionSyncPullResult,
  type SessionSyncPush,
  type SessionSyncPushResult
} from "@edapex/contracts";

/**
 * The client half of the session relay.
 *
 * The transport is injected because the hosts differ: the browser has
 * `fetch(credentials: "include")`, Tauri has `reqwest` behind a command. This
 * module only knows paths, contract shapes and typed failures — it never holds a
 * token and never constructs an origin.
 */

export interface RelayRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: unknown;
}

export interface RelayResponse {
  readonly status: number;
  readonly body: unknown;
}

export type RelayTransport = (request: RelayRequest) => Promise<RelayResponse>;

/** Every failure the relay can produce, named. `status` is 0 when it never arrived. */
export class RelayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "RelayError";
  }
}

interface ErrorEnvelope {
  readonly error: { readonly code: string; readonly message: string };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const envelope = value.error;
  if (typeof envelope !== "object" || envelope === null) return false;
  return (
    "code" in envelope &&
    typeof envelope.code === "string" &&
    "message" in envelope &&
    typeof envelope.message === "string"
  );
}

/** Parses a response body with the same schema the service validated it against. */
function decode<T>(schema: { parse(value: unknown): T }, body: unknown, label: string): T {
  try {
    return schema.parse(body);
  } catch {
    throw new RelayError(
      "contract_mismatch",
      `The relay returned an unexpected ${label} shape.`,
      200
    );
  }
}

type OwnershipCommand =
  | { readonly type: "acquire_lease"; readonly leaseTtlMs: number }
  | { readonly type: "renew_lease"; readonly expectedFence: number }
  | { readonly type: "release_lease"; readonly expectedFence: number }
  | { readonly type: "delete_session" };

export interface RelayClientOptions {
  readonly transport: RelayTransport;
  readonly workspaceId: string;
  readonly sessionId: string;
  /** The device this runtime lives on; the relay's outbox key. */
  readonly deviceId: string;
  /** This client, typically one worker or window; the lease holder. */
  readonly clientId: string;
  /** Injectable so tests and the desktop host can supply their own ids. */
  readonly newCommandId?: () => string;
}

export class SessionRelayClient {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly deviceId: string;
  readonly clientId: string;
  private readonly transport: RelayTransport;
  private readonly newCommandId: () => string;

  constructor(options: RelayClientOptions) {
    this.transport = options.transport;
    this.workspaceId = options.workspaceId;
    this.sessionId = options.sessionId;
    this.deviceId = options.deviceId;
    this.clientId = options.clientId;
    this.newCommandId = options.newCommandId ?? (() => crypto.randomUUID());
  }

  private get base(): string {
    return `/api/v1/agent/sessions/${encodeURIComponent(this.sessionId)}`;
  }

  private async send(request: RelayRequest): Promise<RelayResponse> {
    const response = await this.transport(request);
    if (response.status >= 400) {
      if (isErrorEnvelope(response.body)) {
        throw new RelayError(
          response.body.error.code,
          response.body.error.message,
          response.status
        );
      }
      throw new RelayError("relay_unavailable", "The relay refused the request.", response.status);
    }
    return response;
  }

  private async command(command: OwnershipCommand): Promise<RelayResponse> {
    return this.send({
      method: "POST",
      path: `${this.base}/commands?workspaceId=${encodeURIComponent(this.workspaceId)}`,
      body: { ...command, commandId: this.newCommandId(), sessionId: this.sessionId, clientId: this.clientId }
    });
  }

  async acquireLease(ttlMs: number): Promise<SessionLease> {
    const response = await this.command({ type: "acquire_lease", leaseTtlMs: ttlMs });
    return decode(sessionLeaseResultSchema, response.body, "lease").lease;
  }

  async renewLease(fence: number): Promise<SessionLease> {
    const response = await this.command({ type: "renew_lease", expectedFence: fence });
    return decode(sessionLeaseResultSchema, response.body, "lease").lease;
  }

  async releaseLease(fence: number): Promise<void> {
    const response = await this.command({ type: "release_lease", expectedFence: fence });
    decode(sessionReleaseResultSchema, response.body, "release");
  }

  async deleteSession(): Promise<SessionDeletionResult> {
    const response = await this.command({ type: "delete_session" });
    return decode(sessionDeletionResultSchema, response.body, "deletion");
  }

  async push(push: SessionSyncPush): Promise<SessionSyncPushResult> {
    const response = await this.send({
      method: "POST",
      path: `${this.base}/events`,
      body: push
    });
    return decode(sessionSyncPushResultSchema, response.body, "push result");
  }

  async pull(after: number, limit: number): Promise<SessionSyncPullResult> {
    const response = await this.send({
      method: "GET",
      path: `${this.base}/events?workspaceId=${encodeURIComponent(this.workspaceId)}&after=${after}&limit=${limit}`
    });
    return decode(sessionSyncPullResultSchema, response.body, "pull result");
  }
}
