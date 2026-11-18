-- Agent session relay.
--
-- A session is one root conversation. The relay stores sealed events in arrival
-- order, hands out one lease at a time, and never decrypts: it holds no key
-- material, so a compromised Worker cannot read a transcript.
--
-- `next_position` is the session's own monotonic order. Every accepted batch
-- reserves a contiguous range from it in a single UPDATE, so two concurrent
-- pushes cannot be assigned overlapping positions even before their inserts run.
--
-- `deleted_at_ms` plus `deletion_event_id` is the tombstone. Deleting a session
-- removes its event payloads (the requirement is a hard delete, not a flag on
-- retained ciphertext) while the session row survives so a device that has not
-- pulled yet learns the session is gone instead of silently finding nothing.

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id         TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL,
  workspace_id       TEXT NOT NULL,
  next_position      INTEGER NOT NULL DEFAULT 0,
  event_count        INTEGER NOT NULL DEFAULT 0,
  payload_bytes      INTEGER NOT NULL DEFAULT 0,
  deletion_event_id  TEXT,
  deleted_at_ms      INTEGER,
  created_at_ms      INTEGER NOT NULL,
  updated_at_ms      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_sessions_by_owner
  ON agent_sessions (user_id, workspace_id, updated_at_ms DESC);

CREATE INDEX IF NOT EXISTS agent_sessions_by_thread
  ON agent_sessions (session_id, deleted_at_ms);

-- One row per session, always present after the first acquire. `holder_id` is
-- NULL when the lease is released or expired, and the fence only ever increases:
-- a stale writer must be recognisable, which it would not be if the counter
-- restarted when the holder went away.
CREATE TABLE IF NOT EXISTS agent_session_leases (
  session_id     TEXT PRIMARY KEY REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  holder_id      TEXT,
  fence          INTEGER NOT NULL,
  expires_at_ms  INTEGER NOT NULL,
  updated_at_ms  INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS agent_session_events (
  session_id     TEXT NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  event_id       TEXT NOT NULL,
  device_id      TEXT NOT NULL,
  device_seq     INTEGER NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('projection', 'core_snapshot', 'deletion')),
  ciphertext     TEXT NOT NULL,
  checksum       TEXT NOT NULL,
  position       INTEGER NOT NULL,
  created_at_ms  INTEGER NOT NULL,
  received_at_ms INTEGER NOT NULL,
  PRIMARY KEY (session_id, event_id),
  -- A retried batch carries the same device sequence; uniqueness is what makes
  -- the push idempotent rather than dependent on the client's memory.
  UNIQUE (session_id, device_id, device_seq)
);

CREATE INDEX IF NOT EXISTS agent_session_events_by_position
  ON agent_session_events (session_id, position);
