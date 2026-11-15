-- Agents, their grants, and tenant packages.
--
-- The narrowing invariant is the reason this chunk exists: an agent's effective
-- grant must be a subset of its creator's ceiling, at creation and at every
-- mutation. Without it, agent creation is privilege escalation — a teacher mints an
-- agent, grants it an admin operation, and holds admin authority through a proxy.
--
-- Nothing here caches a "valid" flag. `validateAgentGrant` is re-run on every write
-- and at turn execution, because a role change or a feature disable shrinks the
-- ceiling and every dependent agent's grant with it.

CREATE TABLE IF NOT EXISTS agents (
  id                  TEXT PRIMARY KEY,
  workspace_id        TEXT NOT NULL,
  created_by          TEXT NOT NULL,
  name                TEXT NOT NULL,
  purpose             TEXT NOT NULL,
  model               TEXT NOT NULL,
  channel_id          TEXT,
  -- `local` runs in the host; `remote` is an AG-UI endpoint and needs explicit
  -- admin approval, never a grant derived from its creator.
  kind                TEXT NOT NULL DEFAULT 'local' CHECK (kind IN ('local', 'remote')),
  -- The ceiling this agent was validated against, recorded so a later review can
  -- see what authority existed at creation rather than reconstructing it.
  ceiling_snapshot    TEXT NOT NULL,
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL,
  deleted_at          INTEGER
);

CREATE INDEX IF NOT EXISTS agents_by_workspace ON agents (workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS agent_profiles (
  agent_id       TEXT PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id   TEXT NOT NULL,
  instructions   TEXT NOT NULL DEFAULT '',
  temperature    REAL,
  updated_at     INTEGER NOT NULL
);

-- One row per granted operation. Storing the operation id rather than a boolean
-- per tool means a removed operation simply stops resolving, which is the "dropped,
-- not silently widened" behaviour spec 10 requires.
CREATE TABLE IF NOT EXISTS agent_grants (
  agent_id       TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  workspace_id   TEXT NOT NULL,
  operation_id   TEXT NOT NULL,
  granted_by     TEXT NOT NULL,
  granted_at     INTEGER NOT NULL,
  revoked_at     INTEGER,
  PRIMARY KEY (agent_id, operation_id)
);

CREATE INDEX IF NOT EXISTS agent_grants_by_agent ON agent_grants (workspace_id, agent_id);

-- Tenant package state. `edapex-school` is the first pack, not the platform: a
-- non-school tenant enables no first-party pack and still boots (spec 10, tier 1).
CREATE TABLE IF NOT EXISTS tenant_packages (
  workspace_id   TEXT PRIMARY KEY,
  package_id     TEXT NOT NULL,
  -- Null for a non-school tenant. Deliberately not a join to the school DB.
  template       TEXT NOT NULL CHECK (template IN ('school', 'generic')),
  version        TEXT NOT NULL,
  applied_at     INTEGER NOT NULL,
  applied_by     TEXT NOT NULL
);

-- `agents.yaml` seeds the shipped Bots. These rows are non-deletable and are
-- re-validated on every package load, so a package edit cannot quietly grant more
-- than the pack allows.
CREATE TABLE IF NOT EXISTS tenant_seed_agents (
  workspace_id   TEXT NOT NULL,
  agent_key      TEXT NOT NULL,
  name           TEXT NOT NULL,
  purpose        TEXT NOT NULL,
  operations_json TEXT NOT NULL,
  seeded_at      INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, agent_key)
);
