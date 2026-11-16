//! Schema for the local store.
//!
//! Local tables mirror `42-agent-db-schema.md` for the v1 core. The cloud copy
//! lives in `services/cowork-api/migrations/agent` and shares the logical model.
//!
//! Two rules are enforced by the schema itself rather than by callers:
//!
//! * `data_class` is constrained to `workspace`. School records (`edapex`) and
//!   `edapex-ephemeral` are excluded by construction, so a bug cannot persist
//!   them here even if it tries.
//! * `sync_outbox` shares a device sequence with `sync_events` and the pair is
//!   written in one transaction, so a local write can never exist without the
//!   change that will carry it to the cloud.

/// Final row shape after a decrypted read.
pub const LATEST_VERSION: u32 = 2;

/// The only data class this store may hold.
pub const ALLOWED_DATA_CLASS: &str = "workspace";

pub struct Migration {
    pub version: u32,
    pub name: &'static str,
    pub sql: &'static str,
}

pub const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        name: "core",
        sql: r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version     INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  applied_at  INTEGER NOT NULL
);

-- Data class is pinned. `edapex` (school records) and `edapex-ephemeral`
-- (unpersisted PII) have no representation here at all.
CREATE TABLE IF NOT EXISTS threads (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  agent_id      TEXT,
  -- Sealed payload. The title lives in here rather than in its own column: a
  -- plaintext title would leak the subject of a confidential conversation.
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX IF NOT EXISTS threads_by_workspace ON threads (workspace_id, updated_at DESC);

-- `body` is a sealed envelope, never plaintext. Anything that needs to search the
-- text must decrypt first and write the derived FTS row.
CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  role          TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  device_seq    INTEGER NOT NULL,
  deleted_at    INTEGER
);
CREATE INDEX IF NOT EXISTS messages_by_thread ON messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS message_parts (
  id            TEXT PRIMARY KEY,
  message_id    TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  part_type     TEXT NOT NULL,
  ordinal       INTEGER NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS message_parts_by_message ON message_parts (message_id, ordinal);

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  status        TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  status        TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS approval_requests (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  risk          TEXT NOT NULL,
  decision      TEXT,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  resolved_at   INTEGER
);

CREATE TABLE IF NOT EXISTS approval_rules (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  status        TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifacts (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  kind          TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS artifact_versions (
  id            TEXT PRIMARY KEY,
  artifact_id   TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
  workspace_id  TEXT NOT NULL,
  version       INTEGER NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  UNIQUE (artifact_id, version)
);

CREATE TABLE IF NOT EXISTS memory_facts (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Append-only. `device_seq` is monotonic per device, which is what makes a
-- retried push idempotent: the pair is unique, so a replay is rejected rather
-- than applied twice.
CREATE TABLE IF NOT EXISTS sync_events (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  operation     TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  device_seq    INTEGER NOT NULL,
  checksum      TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (device_id, device_seq)
);

-- Local-only. Never uploaded as a table; the cloud receives batched sync_events.
CREATE TABLE IF NOT EXISTS sync_outbox (
  id            TEXT PRIMARY KEY,
  workspace_id  TEXT NOT NULL,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  operation     TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  device_id     TEXT NOT NULL,
  device_seq    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  UNIQUE (device_id, device_seq)
);
CREATE INDEX IF NOT EXISTS sync_outbox_pending ON sync_outbox (device_id, device_seq);

CREATE TABLE IF NOT EXISTS sync_cursors (
  device_id     TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  scope         TEXT NOT NULL,
  last_seq      INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (device_id, workspace_id, scope)
);

-- Derived, unencrypted, rebuildable, and never synced. It exists only so search
-- does not have to decrypt the whole workspace on every keystroke.
CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5 (
  message_id UNINDEXED,
  body
);
"#,
    },
    Migration {
        version: 2,
        name: "run-journal",
        sql: r#"
-- A run is resumable work. v1 created the table; this adds what a worker needs
-- to decide *whether* to resume it without opening a sealed body.
--
-- The table is rebuilt rather than altered because v1 declared
-- `thread_id REFERENCES threads(id)`, and a worker resumes from the journal
-- alone: it cannot be required to materialise a synced thread row before it can
-- record that work is pending. v1 has no production writer for `runs`, so the
-- rebuild starts from empty.
CREATE TABLE runs_v2 (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  status        TEXT NOT NULL,
  body          BLOB NOT NULL,
  -- Sealed with the run, but separately: the checkpoint is rewritten after every
  -- tool round, while these two never change. Folding them into `body` would make
  -- each checkpoint a read-modify-write.
  -- Nullable because `write_record` also writes `runs` rows for sync, and those
  -- carry no local resume state. A row without them is simply not resumable.
  input         BLOB,
  settings      BLOB,
  data_class    TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  attempt       INTEGER NOT NULL DEFAULT 0,
  lease_until   INTEGER NOT NULL DEFAULT 0,
  error         TEXT
);
DROP TABLE runs;
ALTER TABLE runs_v2 RENAME TO runs;
CREATE INDEX IF NOT EXISTS runs_open ON runs (status, lease_until);

-- Append-only, sealed, and **local only**: unlike `runs`, an event never enters
-- `sync_outbox`. It is resume state for this device's worker; syncing it would
-- ship one device's in-flight turn to another for no benefit.
CREATE TABLE IF NOT EXISTS run_events (
  run_id      TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  seq         INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  body        BLOB NOT NULL,
  data_class  TEXT NOT NULL CHECK (data_class = 'workspace'),
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS run_events_by_run ON run_events (run_id, seq);
"#,
    },
];
