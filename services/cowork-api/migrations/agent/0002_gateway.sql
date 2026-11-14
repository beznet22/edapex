-- Agent audit trail and the connector secret box.
--
-- `agent_secrets` holds ciphertext only. The Worker derives a per-workspace key
-- from its master secret, so a database dump exposes no usable credential.
--
-- Audit events are written before and after every write. They never contain a
-- token: `redactArguments` runs on the way in, because a secret that reached a
-- log has already leaked.

CREATE TABLE IF NOT EXISTS agent_audit_events (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  agent_id             TEXT,
  actor_id             TEXT NOT NULL,
  tool_name            TEXT NOT NULL,
  risk                 TEXT NOT NULL,
  outcome              TEXT NOT NULL,
  approval_request_id  TEXT,
  arguments_json       TEXT NOT NULL,
  result_summary       TEXT,
  created_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS agent_audit_by_workspace
  ON agent_audit_events (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS agent_audit_by_outcome
  ON agent_audit_events (workspace_id, outcome, created_at DESC);

-- Write-only through the API: `SecretBox` exposes `withSecret` and `list`, never
-- a read of `ciphertext`.
CREATE TABLE IF NOT EXISTS agent_secrets (
  workspace_id  TEXT NOT NULL,
  name          TEXT NOT NULL,
  ciphertext    TEXT NOT NULL,
  key_id        TEXT NOT NULL,
  updated_at    INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS connector_grants (
  connector_id  TEXT NOT NULL,
  agent_id      TEXT NOT NULL,
  workspace_id  TEXT NOT NULL,
  tool_name     TEXT NOT NULL,
  access        TEXT NOT NULL CHECK (access IN ('read', 'write')),
  granted_by    TEXT NOT NULL,
  granted_at    INTEGER NOT NULL,
  revoked_at    INTEGER,
  PRIMARY KEY (connector_id, agent_id, tool_name)
);

CREATE INDEX IF NOT EXISTS connector_grants_by_agent
  ON connector_grants (workspace_id, agent_id);

-- Per-person OAuth. One row per user per connector: there is no deployment-wide
-- shared mailbox token, and `revoked_at` is a tombstone rather than a delete so
-- the history of a revoked connection survives.
CREATE TABLE IF NOT EXISTS connector_accounts (
  id             TEXT PRIMARY KEY,
  workspace_id   TEXT NOT NULL,
  connector_id   TEXT NOT NULL,
  user_id        TEXT NOT NULL,
  account_email  TEXT,
  -- Name of the entry in `agent_secrets`; never the token itself.
  secret_name    TEXT NOT NULL,
  scopes         TEXT NOT NULL,
  created_at     INTEGER NOT NULL,
  last_used_at   INTEGER,
  revoked_at     INTEGER,
  UNIQUE (workspace_id, connector_id, user_id)
);
