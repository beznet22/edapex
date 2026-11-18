import {
  SESSION_SYNC_BATCH_LIMIT,
  type SessionDeletion,
  type SessionSyncAcknowledgement,
  type SessionSyncEvent
} from "@edapex/contracts";

import { RelayError, type SessionRelayClient } from "./relay-client";
import type { LeaseKeeper } from "./lease-keeper";

/**
 * One sync pass over the session relay.
 *
 * The order is push-then-pull on purpose: a device's own work reaches the relay
 * before it reads other devices' events, so a turn this device just finished is
 * never missing from its own next pull.
 *
 * Staleness is handled once per batch — forget the lease, take it back, retry —
 * and then reported. Retrying forever would turn a lost lease into a hang.
 */

export interface SessionSyncStore {
  /** Sealed events whose device sequence has not been acknowledged, oldest first. */
  pendingEvents(limit: number): Promise<readonly SessionSyncEvent[]>;
  acknowledge(acknowledgements: readonly SessionSyncAcknowledgement[]): Promise<void>;
  cursor(): Promise<number>;
  applyEvents(events: readonly SessionSyncEvent[]): Promise<void>;
  applyDeletion(deletion: SessionDeletion): Promise<void>;
  setCursor(position: number): Promise<void>;
}

export interface SyncReport {
  readonly pushed: number;
  readonly pulled: number;
  readonly deleted: boolean;
  readonly cursor: number;
}

export interface SyncOptions {
  readonly client: SessionRelayClient;
  readonly lease: LeaseKeeper;
  readonly store: SessionSyncStore;
  readonly batchLimit?: number;
  readonly pageLimit?: number;
  readonly maxPages?: number;
}

function accepted(acknowledgements: readonly SessionSyncAcknowledgement[]): number {
  return acknowledgements.filter((ack) => ack.status === "accepted").length;
}

export async function syncOnce(options: SyncOptions): Promise<SyncReport> {
  const { client, lease, store } = options;
  const batchLimit = options.batchLimit ?? SESSION_SYNC_BATCH_LIMIT;
  const pageLimit = options.pageLimit ?? SESSION_SYNC_BATCH_LIMIT;
  const maxPages = options.maxPages ?? 50;

  let pushed = 0;
  let stalled = 0;

  for (;;) {
    const pending = await store.pendingEvents(batchLimit);
    if (pending.length === 0) break;

    const current = await lease.ensure();
    const result = await client.push({
      workspaceId: client.workspaceId,
      sessionId: client.sessionId,
      deviceId: client.deviceId,
      clientId: client.clientId,
      fence: current.fence,
      events: pending.map((event) => ({ ...event, relayPosition: null }))
    });
    await store.acknowledge(result.acknowledgements);

    const progressed = accepted(result.acknowledgements);
    pushed += progressed;
    if (progressed === 0 && result.acknowledgements.length > 0) {
      stalled += 1;
      if (stalled >= 2) {
        throw new RelayError(
          "lease_stale",
          "The relay refused this device's lease twice; the session was taken over.",
          409
        );
      }
      lease.forget();
      continue;
    }
    stalled = 0;
    if (pending.length < batchLimit) break;
  }

  let cursor = await store.cursor();
  let pulled = 0;
  let deleted = false;

  for (let page = 0; page < maxPages; page += 1) {
    const result = await client.pull(cursor, pageLimit);
    if (result.events.length > 0) {
      await store.applyEvents(result.events);
      pulled += result.events.length;
    }
    if (result.deletion !== null) {
      await store.applyDeletion(result.deletion);
      deleted = true;
      cursor = result.nextPosition;
      await store.setCursor(cursor);
      break;
    }
    if (result.nextPosition !== cursor) {
      cursor = result.nextPosition;
      await store.setCursor(cursor);
    }
    if (result.events.length < pageLimit) break;
  }

  return { pushed, pulled, deleted, cursor };
}
