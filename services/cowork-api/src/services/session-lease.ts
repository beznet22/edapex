import { apiError, type ApiError } from "../schema";

/**
 * Session ownership and the relay lease.
 *
 * A session is scoped to one user and one workspace. Every lookup is filtered by
 * `user_id`, so a session id from another account answers `session_unknown`
 * rather than being touched — the same rule the device registry follows.
 *
 * The lease is deliberately a single statement. A read-then-write would let two
 * tabs both observe "expired" and both take over; the upsert decides for exactly
 * one of them, and the fence only ever increases so a stale writer stays
 * recognisable after the holder goes away.
 */

export interface SessionOwner {
  readonly sessionId: string;
  readonly userId: string;
  readonly workspaceId: string;
}

export interface SessionRow {
  readonly workspaceId: string;
  readonly nextPosition: number;
  readonly eventCount: number;
  readonly payloadBytes: number;
  readonly deletionEventId: string | null;
  readonly deletedAtMs: number | null;
}

export interface SessionLeaseRecord {
  readonly sessionId: string;
  readonly holderId: string;
  readonly fence: number;
  readonly expiresAtMs: number;
}

export interface LeaseFailure {
  readonly ok: false;
  readonly status: 404 | 403 | 409 | 410;
  readonly error: ApiError;
}

export type SessionResult =
  | { readonly ok: true; readonly session: SessionRow }
  | LeaseFailure;

export type LeaseResult =
  | { readonly ok: true; readonly lease: SessionLeaseRecord }
  | LeaseFailure;

interface SessionDbRow {
  readonly workspace_id: string;
  readonly next_position: number;
  readonly event_count: number;
  readonly payload_bytes: number;
  readonly deletion_event_id: string | null;
  readonly deleted_at_ms: number | null;
}

interface LeaseDbRow {
  readonly holder_id: string | null;
  readonly fence: number;
  readonly expires_at_ms: number;
}

/** Reads a session the caller owns. Never returns another user's row. */
export async function loadSession(
  db: D1Database,
  owner: SessionOwner
): Promise<SessionResult> {
  const row = await db
    .prepare(
      "SELECT workspace_id, next_position, event_count, payload_bytes, deletion_event_id, deleted_at_ms \
       FROM agent_sessions WHERE session_id = ? AND user_id = ?"
    )
    .bind(owner.sessionId, owner.userId)
    .first<SessionDbRow>();
  if (row === null) {
    return { ok: false, status: 404, error: apiError("Unknown session.", "session_unknown") };
  }
  if (row.workspace_id !== owner.workspaceId) {
    return {
      ok: false,
      status: 403,
      error: apiError("This session belongs to another workspace.", "workspace_mismatch")
    };
  }
  return {
    ok: true,
    session: {
      workspaceId: row.workspace_id,
      nextPosition: row.next_position,
      eventCount: row.event_count,
      payloadBytes: row.payload_bytes,
      deletionEventId: row.deletion_event_id,
      deletedAtMs: row.deleted_at_ms
    }
  };
}

/** Creates the session on first use; ownership conflicts stay visible. */
export async function ensureSession(
  db: D1Database,
  owner: SessionOwner,
  nowMs: number
): Promise<SessionResult> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO agent_sessions \
       (session_id, user_id, workspace_id, created_at_ms, updated_at_ms) \
       VALUES (?, ?, ?, ?, ?)"
    )
    .bind(owner.sessionId, owner.userId, owner.workspaceId, nowMs, nowMs)
    .run();
  return loadSession(db, owner);
}

export function sessionDeleted(sessionId: string): LeaseFailure {
  return {
    ok: false,
    status: 410,
    error: apiError(`Session ${sessionId} was deleted.`, "session_deleted")
  };
}

export async function acquireLease(
  db: D1Database,
  owner: SessionOwner,
  clientId: string,
  ttlMs: number,
  nowMs: number
): Promise<LeaseResult> {
  const session = await ensureSession(db, owner, nowMs);
  if (!session.ok) return session;
  if (session.session.deletedAtMs !== null) return sessionDeleted(owner.sessionId);

  const row = await db
    .prepare(
      "INSERT INTO agent_session_leases (session_id, holder_id, fence, expires_at_ms, updated_at_ms) \
       VALUES (?, ?, 1, ?, ?) \
       ON CONFLICT (session_id) DO UPDATE SET \
         holder_id = excluded.holder_id, \
         fence = agent_session_leases.fence + 1, \
         expires_at_ms = excluded.expires_at_ms, \
         updated_at_ms = excluded.updated_at_ms \
       WHERE agent_session_leases.holder_id IS NULL \
          OR agent_session_leases.expires_at_ms <= ? \
          OR agent_session_leases.holder_id = excluded.holder_id \
       RETURNING holder_id, fence, expires_at_ms"
    )
    .bind(
      owner.sessionId,
      clientId,
      nowMs + ttlMs,
      nowMs,
      nowMs
    )
    .first<LeaseDbRow>();

  if (row === null || row.holder_id === null) {
    return {
      ok: false,
      status: 409,
      error: apiError("Another client holds this session.", "lease_held")
    };
  }
  return {
    ok: true,
    lease: {
      sessionId: owner.sessionId,
      holderId: row.holder_id,
      fence: row.fence,
      expiresAtMs: row.expires_at_ms
    }
  };
}

export async function renewLease(
  db: D1Database,
  owner: SessionOwner,
  clientId: string,
  fence: number,
  ttlMs: number,
  nowMs: number
): Promise<LeaseResult> {
  const row = await db
    .prepare(
      "UPDATE agent_session_leases SET expires_at_ms = ?, updated_at_ms = ? \
       WHERE session_id = ? AND holder_id = ? AND fence = ? AND expires_at_ms > ? \
       RETURNING holder_id, fence, expires_at_ms"
    )
    .bind(nowMs + ttlMs, nowMs, owner.sessionId, clientId, fence, nowMs)
    .first<LeaseDbRow>();

  if (row === null || row.holder_id === null) {
    return {
      ok: false,
      status: 409,
      error: apiError("This lease is no longer held by this client.", "lease_stale")
    };
  }
  return {
    ok: true,
    lease: {
      sessionId: owner.sessionId,
      holderId: row.holder_id,
      fence: row.fence,
      expiresAtMs: row.expires_at_ms
    }
  };
}

/** Releases without lowering the fence, so the next acquire still advances it. */
export async function releaseLease(
  db: D1Database,
  owner: SessionOwner,
  clientId: string,
  fence: number,
  nowMs: number
): Promise<{ readonly ok: true } | LeaseFailure> {
  const row = await db
    .prepare(
      "UPDATE agent_session_leases SET holder_id = NULL, updated_at_ms = ? \
       WHERE session_id = ? AND holder_id = ? AND fence = ? \
       RETURNING session_id"
    )
    .bind(nowMs, owner.sessionId, clientId, fence)
    .first<{ readonly session_id: string }>();

  if (row === null) {
    return {
      ok: false,
      status: 409,
      error: apiError("This lease is no longer held by this client.", "lease_stale")
    };
  }
  return { ok: true };
}

/** The lease as push sees it: absent, expired, or held by someone. */
export async function heldLease(
  db: D1Database,
  sessionId: string
): Promise<{ readonly holderId: string | null; readonly fence: number; readonly expiresAtMs: number } | null> {
  const row = await db
    .prepare(
      "SELECT holder_id, fence, expires_at_ms FROM agent_session_leases WHERE session_id = ?"
    )
    .bind(sessionId)
    .first<LeaseDbRow>();
  if (row === null) return null;
  return { holderId: row.holder_id, fence: row.fence, expiresAtMs: row.expires_at_ms };
}
