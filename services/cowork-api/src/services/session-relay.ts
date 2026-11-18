import type {
  SessionSyncEvent,
  SessionSyncEventKind,
  SessionSyncPullResult,
  SessionSyncPush,
  SessionSyncPushResult
} from "@edapex/contracts";

import { apiError, type ApiError } from "../schema";
import {
  heldLease,
  loadSession,
  sessionDeleted,
  type LeaseFailure,
  type SessionOwner
} from "./session-lease";
import { checksumOf } from "./sync";

/**
 * The session relay.
 *
 * Order is the server's: every accepted batch reserves a contiguous range from
 * the session's `next_position` in one UPDATE, so concurrent pushes cannot
 * overlap. Idempotency is a uniqueness constraint, not client memory — a retried
 * batch carries the same device sequence and comes back as `duplicate`.
 *
 * The relay never decrypts. It verifies the checksum so a truncated body fails
 * at the boundary instead of on the device that later tries to open it.
 */

export const MAX_SESSION_EVENTS = 10_000;
export const MAX_SESSION_BYTES = 256 * 1024 * 1024;

/** Whether accepting this batch would take the session past its relay quota. */
export function quotaExceeded(
  current: { readonly eventCount: number; readonly payloadBytes: number },
  incomingEvents: number,
  incomingBytes: number
): boolean {
  return (
    current.eventCount + incomingEvents > MAX_SESSION_EVENTS ||
    current.payloadBytes + incomingBytes > MAX_SESSION_BYTES
  );
}
export const MAX_PULL_LIMIT = 100;
export const MIN_PULL_LIMIT = 1;

export type RelayFailure = {
  readonly ok: false;
  readonly status: 400 | 403 | 404 | 409 | 410 | 413;
  readonly error: ApiError;
};

export type PushOutcome =
  | { readonly ok: true; readonly result: SessionSyncPushResult }
  | RelayFailure;

export type PullOutcome =
  | { readonly ok: true; readonly result: SessionSyncPullResult }
  | RelayFailure;

export type DeleteOutcome =
  | { readonly ok: true; readonly position: number; readonly deletionEventId: string }
  | RelayFailure;

const asFailure = (failure: LeaseFailure): RelayFailure => failure;

interface EventRow {
  readonly event_id: string;
  readonly device_id: string;
  readonly device_seq: number;
  readonly kind: string;
  readonly ciphertext: string;
  readonly checksum: string;
  readonly position: number;
  readonly created_at_ms: number;
}

function toKind(value: string): SessionSyncEventKind {
  if (value === "core_snapshot" || value === "deletion") return value;
  return "projection";
}

function toEvent(row: EventRow, sessionId: string): SessionSyncEvent {
  return {
    eventId: row.event_id,
    sessionId,
    deviceId: row.device_id,
    deviceSeq: row.device_seq,
    kind: toKind(row.kind),
    ciphertext: row.ciphertext,
    checksum: row.checksum,
    createdAtMs: row.created_at_ms,
    relayPosition: row.position
  };
}

/** Pushes one batch. A stale fence accepts nothing and says so per event. */
export async function pushSessionEvents(
  db: D1Database,
  owner: SessionOwner,
  input: SessionSyncPush,
  nowMs: number
): Promise<PushOutcome> {
  const session = await loadSession(db, owner);
  if (!session.ok) return asFailure(session);
  if (session.session.deletedAtMs !== null) return asFailure(sessionDeleted(owner.sessionId));

  const lease = await heldLease(db, owner.sessionId);
  const current =
    lease !== null &&
    lease.holderId === input.clientId &&
    lease.fence === input.fence &&
    lease.expiresAtMs > nowMs;
  if (!current) {
    return {
      ok: true,
      result: {
        acknowledgements: input.events.map((event) => ({
          eventId: event.eventId,
          status: "stale" as const,
          position: null
        })),
        nextPosition: session.session.nextPosition
      }
    };
  }

  for (const event of input.events) {
    const expected = await checksumOf(event.ciphertext);
    if (expected !== event.checksum) {
      return {
        ok: false,
        status: 400,
        error: apiError(`Checksum mismatch for event ${event.eventId}.`, "invalid_request")
      };
    }
  }

  const existing = await db
    .prepare(
      "SELECT device_seq FROM agent_session_events WHERE session_id = ? AND device_id = ?"
    )
    .bind(owner.sessionId, input.deviceId)
    .all<{ readonly device_seq: number }>();

  const known = new Set(existing.results.map((row) => row.device_seq));
  const fresh = input.events.filter((event) => {
    if (known.has(event.deviceSeq)) return false;
    known.add(event.deviceSeq);
    return true;
  });

  if (fresh.length === 0) {
    return {
      ok: true,
      result: {
        acknowledgements: input.events.map((event) => ({
          eventId: event.eventId,
          status: "duplicate" as const,
          position: null
        })),
        nextPosition: session.session.nextPosition
      }
    };
  }

  const bytes = fresh.reduce((total, event) => total + event.ciphertext.length, 0);
  if (quotaExceeded(session.session, fresh.length, bytes)) {
    return {
      ok: false,
      status: 413,
      error: apiError(
        "This session has reached its relay quota; delete or start a new one.",
        "quota_exceeded"
      )
    };
  }

  const reserved = await db
    .prepare(
      "UPDATE agent_sessions \
       SET next_position = next_position + ?, event_count = event_count + ?, \
           payload_bytes = payload_bytes + ?, updated_at_ms = ? \
       WHERE session_id = ? AND deleted_at_ms IS NULL \
       RETURNING next_position"
    )
    .bind(fresh.length, fresh.length, bytes, nowMs, owner.sessionId)
    .first<{ readonly next_position: number }>();

  const end = reserved?.next_position ?? session.session.nextPosition + fresh.length;
  const start = end - fresh.length + 1;
  const positionBySeq = new Map<number, number>();
  fresh.forEach((event, index) => positionBySeq.set(event.deviceSeq, start + index));

  await db.batch(
    fresh.map((event) =>
      db
        .prepare(
          "INSERT OR IGNORE INTO agent_session_events \
           (session_id, event_id, device_id, device_seq, kind, ciphertext, checksum, position, created_at_ms, received_at_ms) \
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          owner.sessionId,
          event.eventId,
          input.deviceId,
          event.deviceSeq,
          event.kind,
          event.ciphertext,
          event.checksum,
          positionBySeq.get(event.deviceSeq) ?? start,
          event.createdAtMs,
          nowMs
        )
    )
  );

  return {
    ok: true,
    result: {
      acknowledgements: input.events.map((event) => {
        const position = positionBySeq.get(event.deviceSeq);
        return position === undefined
          ? { eventId: event.eventId, status: "duplicate" as const, position: null }
          : { eventId: event.eventId, status: "accepted" as const, position };
      }),
      nextPosition: end
    }
  };
}

/** Pulls events after a position. A deleted session answers with its tombstone. */
export async function pullSessionEvents(
  db: D1Database,
  owner: SessionOwner,
  after: number,
  limit: number
): Promise<PullOutcome> {
  const session = await loadSession(db, owner);
  if (!session.ok) return asFailure(session);

  const deleted = session.session.deletedAtMs !== null;
  const rows = deleted
    ? { results: [] as EventRow[] }
    : await db
        .prepare(
          "SELECT event_id, device_id, device_seq, kind, ciphertext, checksum, position, created_at_ms \
           FROM agent_session_events WHERE session_id = ? AND position > ? \
           ORDER BY position ASC LIMIT ?"
        )
        .bind(owner.sessionId, after, limit)
        .all<EventRow>();

  const events = rows.results.map((row) => toEvent(row, owner.sessionId));
  const last = events.at(-1);
  return {
    ok: true,
    result: {
      events,
      nextPosition: last?.relayPosition ?? after,
      deletion:
        deleted && session.session.deletionEventId !== null
          ? {
              sessionId: owner.sessionId,
              deletionEventId: session.session.deletionEventId,
              deletedAtMs: session.session.deletedAtMs ?? 0
            }
          : null
    }
  };
}

/**
 * Hard-deletes the payloads and leaves a tombstone.
 *
 * The event rows go; the session row stays so a device that had not pulled yet
 * receives `deletion` instead of an empty history it would mistake for a new
 * conversation. The lease is released in the same batch.
 */
export async function deleteSession(
  db: D1Database,
  owner: SessionOwner,
  clientId: string,
  deletionEventId: string,
  nowMs: number
): Promise<DeleteOutcome> {
  const session = await loadSession(db, owner);
  if (!session.ok) return asFailure(session);

  const lease = await heldLease(db, owner.sessionId);
  if (lease === null || lease.holderId !== clientId || lease.expiresAtMs <= nowMs) {
    return {
      ok: false,
      status: 409,
      error: apiError("The session can only be deleted by its current holder.", "lease_stale")
    };
  }

  if (session.session.deletedAtMs !== null) {
    return {
      ok: true,
      position: session.session.nextPosition,
      deletionEventId: session.session.deletionEventId ?? deletionEventId
    };
  }

  const reserved = await db
    .prepare(
      "UPDATE agent_sessions \
       SET deleted_at_ms = ?, deletion_event_id = ?, next_position = next_position + 1, \
           event_count = 0, payload_bytes = 0, updated_at_ms = ? \
       WHERE session_id = ? AND deleted_at_ms IS NULL \
       RETURNING next_position"
    )
    .bind(nowMs, deletionEventId, nowMs, owner.sessionId)
    .first<{ readonly next_position: number }>();

  await db.batch([
    db.prepare("DELETE FROM agent_session_events WHERE session_id = ?").bind(owner.sessionId),
    db
      .prepare(
        "UPDATE agent_session_leases SET holder_id = NULL, updated_at_ms = ? WHERE session_id = ?"
      )
      .bind(nowMs, owner.sessionId)
  ]);

  return {
    ok: true,
    position: reserved?.next_position ?? session.session.nextPosition + 1,
    deletionEventId
  };
}
