-- AGENT_DB core: device registry and the sync event channel.
--
-- This database is bound only to `edapex-cowork-api`. The school `DB` is never
-- bound here, so no statement in this Worker can reach student records. That is
-- the structural form of "no school data": the credentials for it do not exist
-- in this process.
--
-- Row bodies are ciphertext produced on the device with XChaCha20-Poly1305. The
-- server stores and routes them; it cannot read them.

CREATE TABLE IF NOT EXISTS sync_devices (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  public_key    TEXT NOT NULL,
  name          TEXT,
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER,
  revoked_at    INTEGER
);

CREATE INDEX IF NOT EXISTS sync_devices_by_user ON sync_devices (user_id, revoked_at);

-- Append-only. `(device_id, device_seq)` is unique so a retried push is rejected
-- by the database rather than by application logic. A client that retries after
-- a timeout must not be able to apply its batch twice.
CREATE TABLE IF NOT EXISTS sync_events (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  operation     TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  ciphertext    TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  device_seq    INTEGER NOT NULL,
  checksum      TEXT NOT NULL,
  -- The client's own clock. The spec's `created_at`; never used for ordering,
  -- because a device with a wrong clock would write events that sort behind a
  -- reader's cursor and never be pulled.
  created_at    INTEGER NOT NULL,
  -- Server receive time. This is the pull order, and it is assigned here so the
  -- ordering cannot be influenced by the client.
  received_at   INTEGER NOT NULL,
  UNIQUE (device_id, device_seq)
);

CREATE INDEX IF NOT EXISTS sync_events_by_workspace
  ON sync_events (workspace_id, received_at, id);

-- The cursor a device has durably acknowledged. Advanced only after a push is
-- committed, never optimistically.
CREATE TABLE IF NOT EXISTS sync_cursors (
  device_id     TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  scope         TEXT NOT NULL,
  last_seq      INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (device_id, workspace_id, scope)
);
