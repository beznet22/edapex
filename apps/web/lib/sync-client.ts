/**
 * Client side of the sync channel.
 *
 * The store already guarantees that a local write and its outbox row commit
 * together. This closes the other half: taking those rows to the service and
 * advancing the cursor only once the service has durably accepted them.
 *
 * The ordering rule that matters is on failure. A batch that is not acknowledged
 * stays in the outbox and is retried, which is safe because the service accepts a
 * replayed `(deviceId, deviceSeq)` as a no-op. A batch acknowledged before the
 * push succeeded would be lost with nothing left to recover it.
 */

export interface PushItem {
  readonly id: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly operation: "create" | "update" | "delete" | "tombstone";
  readonly ciphertext: string;
  readonly checksum: string;
  readonly deviceSeq: number;
  readonly createdAt: number;
}

/** Supplied by the local store (Rust `push_batch` / `acknowledge`). */
export interface Outbox {
  nextBatch(deviceId: string, limit: number): Promise<readonly PushItem[]>;
  acknowledge(deviceId: string, workspaceId: string, throughSeq: number): Promise<void>;
}

export interface PulledEvent extends PushItem {
  readonly seq: string;
  readonly deviceId: string;
}

export interface SyncTransport {
  push(input: {
    readonly workspaceId: string;
    readonly deviceId: string;
    readonly events: readonly PushItem[];
  }): Promise<{ readonly accepted: number; readonly cursor: number }>;
  pull(input: {
    readonly workspaceId: string;
    readonly deviceId: string;
    readonly cursor: string;
    readonly limit: number;
  }): Promise<{ readonly events: readonly PulledEvent[]; readonly nextCursor: string }>;
}

/** Thrown by a transport when the service answers with a non-retryable status. */
export class SyncRejectedError extends Error {
  constructor(
    message: string,
    readonly code: "unauthorized" | "device_revoked" | "device_unknown" | "invalid_request"
  ) {
    super(message);
    this.name = "SyncRejectedError";
  }
}

export type FlushOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "pushed"; readonly batches: number; readonly accepted: number }
  | { readonly kind: "rejected"; readonly code: SyncRejectedError["code"]; readonly message: string }
  | { readonly kind: "retry"; readonly message: string; readonly backoffMs: number }
  | { readonly kind: "bounded"; readonly batches: number; readonly accepted: number };

export interface SyncClientOptions {
  readonly outbox: Outbox;
  readonly transport: SyncTransport;
  /** Events per push. The service caps a batch at 200. */
  readonly batchSize?: number;
  /** Guard against a store that never empties. */
  readonly maxBatches?: number;
  /** First retry delay; doubles up to `maxBackoffMs`. */
  readonly baseBackoffMs?: number;
  readonly maxBackoffMs?: number;
}

const DEFAULTS = {
  batchSize: 50,
  maxBatches: 20,
  baseBackoffMs: 500,
  maxBackoffMs: 30_000
} as const;

export class SyncClient {
  private consecutiveFailures = 0;

  constructor(private readonly options: SyncClientOptions) {}

  /** Delay before the next attempt, growing with consecutive failures. */
  get backoffMs(): number {
    if (this.consecutiveFailures === 0) return 0;
    const base = this.options.baseBackoffMs ?? DEFAULTS.baseBackoffMs;
    const max = this.options.maxBackoffMs ?? DEFAULTS.maxBackoffMs;
    return Math.min(max, base * 2 ** (this.consecutiveFailures - 1));
  }

  /**
   * Drains the outbox into the service.
   *
   * Returns rather than throwing for the failure cases a caller has to act on
   * differently: retrying a revoked device is pointless, and retrying an expired
   * session needs a sign-in, not a delay.
   */
  async flush(deviceId: string, workspaceId: string): Promise<FlushOutcome> {
    const batchSize = this.options.batchSize ?? DEFAULTS.batchSize;
    const maxBatches = this.options.maxBatches ?? DEFAULTS.maxBatches;

    let batches = 0;
    let acceptedTotal = 0;

    for (let round = 0; round < maxBatches; round += 1) {
      let batch: readonly PushItem[];
      try {
        batch = await this.options.outbox.nextBatch(deviceId, batchSize);
      } catch (cause) {
        return this.fail(cause, "The local store could not be read.");
      }

      if (batch.length === 0) {
        this.consecutiveFailures = 0;
        return batches === 0
          ? { kind: "idle" }
          : { kind: "pushed", batches, accepted: acceptedTotal };
      }

      const highest = batch.reduce((max, item) => Math.max(max, item.deviceSeq), 0);

      try {
        const result = await this.options.transport.push({
          workspaceId,
          deviceId,
          events: batch
        });

        // Acknowledge only after the service has answered. The high-water mark is
        // used rather than the count, so a short acknowledge can never clear rows
        // that were not part of this batch.
        await this.options.outbox.acknowledge(deviceId, workspaceId, highest);

        batches += 1;
        acceptedTotal += result.accepted;
      } catch (cause) {
        if (cause instanceof SyncRejectedError) {
          // Nothing is acknowledged. The outbox is left intact so a re-pair or a
          // fresh sign-in can resume without data loss.
          return { kind: "rejected", code: cause.code, message: cause.message };
        }
        return this.fail(cause, "The sync service could not be reached.");
      }
    }

    return { kind: "bounded", batches, accepted: acceptedTotal };
  }

  private fail(cause: unknown, fallback: string): FlushOutcome {
    this.consecutiveFailures += 1;
    return {
      kind: "retry",
      message: cause instanceof Error ? cause.message : fallback,
      backoffMs: this.backoffMs
    };
  }
}

/**
 * `fetch`-backed transport.
 *
 * Status handling is the whole point: 401 and 403 are terminal for this attempt
 * and must not be retried on a timer, while a 5xx or a network failure is worth
 * backing off for. Collapsing them into one "failed" would either spin on an
 * expired session or give up on a transient outage.
 */
export function createHttpSyncTransport(options: {
  readonly baseUrl: string;
  readonly fetchImpl?: typeof fetch;
}): SyncTransport {
  const doFetch = options.fetchImpl ?? globalThis.fetch.bind(globalThis);

  const rejection = async (response: Response): Promise<SyncRejectedError> => {
    let code: SyncRejectedError["code"] = "invalid_request";
    try {
      const body = (await response.json()) as { error?: { code?: string; message?: string } };
      const reported = body.error?.code;
      if (reported === "unauthorized" || reported === "device_revoked" || reported === "device_unknown") {
        code = reported;
      }
      return new SyncRejectedError(body.error?.message ?? "Sync rejected.", code);
    } catch {
      return new SyncRejectedError("Sync rejected.", code);
    }
  };

  return {
    async push(input) {
      const response = await doFetch(`${options.baseUrl}/api/v1/agent/sync/push`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      });

      if (response.status === 401) {
        throw new SyncRejectedError("Sign in to continue.", "unauthorized");
      }
      if (response.status === 403 || response.status === 400) {
        throw await rejection(response);
      }
      if (!response.ok) {
        // 5xx and anything unexpected stays retryable.
        throw new Error(`The sync service returned ${response.status}.`);
      }

      return (await response.json()) as { accepted: number; cursor: number };
    },

    async pull(input) {
      const query = new URLSearchParams({
        workspaceId: input.workspaceId,
        deviceId: input.deviceId,
        cursor: input.cursor,
        limit: String(input.limit)
      });
      const response = await doFetch(
        `${options.baseUrl}/api/v1/agent/sync/pull?${query.toString()}`,
        { method: "GET", credentials: "include", headers: { accept: "application/json" } }
      );

      if (response.status === 401) {
        throw new SyncRejectedError("Sign in to continue.", "unauthorized");
      }
      if (response.status === 403 || response.status === 400) {
        throw await rejection(response);
      }
      if (!response.ok) {
        throw new Error(`The sync service returned ${response.status}.`);
      }

      return (await response.json()) as {
        events: readonly PulledEvent[];
        nextCursor: string;
      };
    }
  };
}
