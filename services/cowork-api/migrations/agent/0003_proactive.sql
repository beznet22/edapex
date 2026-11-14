-- Proactive work: brief claims and routine runs.
--
-- Routines run on the device, never on a Worker cron (spec 41). This schema
-- exists only to hold state, leases and cursors — nothing here schedules itself.
--
-- The `brief_claims` shape is deliberate. A single "has this been done" flag
-- cannot distinguish two very different situations:
--
--   * another device is working on it right now  -> wait
--   * the device that claimed it crashed         -> take over
--
-- With one flag, a crash leaves the day permanently claimed and no device can ever
-- produce that brief. So the claim lease and the completion are separate columns,
-- and only `completed_at` is permanent.

CREATE TABLE IF NOT EXISTS brief_claims (
  workspace_id       TEXT NOT NULL,
  user_id            TEXT NOT NULL,
  local_date         TEXT NOT NULL,
  claimed_by_device  TEXT NOT NULL,
  claimed_at         INTEGER NOT NULL,
  lease_until        INTEGER NOT NULL,
  completed_at       INTEGER,
  brief_id           TEXT,
  PRIMARY KEY (workspace_id, user_id, local_date)
);

CREATE INDEX IF NOT EXISTS brief_claims_by_lease
  ON brief_claims (lease_until)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS routines (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id     TEXT NOT NULL,
  title        TEXT NOT NULL,
  instructions TEXT NOT NULL,
  schedule     TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,
  next_run_at  INTEGER,
  last_run_at  INTEGER,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS routines_by_due
  ON routines (workspace_id, enabled, next_run_at);

CREATE TABLE IF NOT EXISTS routine_runs (
  id           TEXT PRIMARY KEY,
  routine_id   TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL,
  device_id    TEXT NOT NULL,
  started_at   INTEGER NOT NULL,
  lease_until  INTEGER NOT NULL,
  finished_at  INTEGER,
  status       TEXT NOT NULL,
  waiting_json TEXT,
  error        TEXT,
  source       TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS routine_runs_by_routine
  ON routine_runs (routine_id, started_at DESC);

-- A stale run is re-claimable rather than stuck: a `running` row whose lease has
-- expired means the executing device disappeared.
CREATE INDEX IF NOT EXISTS routine_runs_by_lease
  ON routine_runs (lease_until)
  WHERE finished_at IS NULL;

CREATE TABLE IF NOT EXISTS proactive_settings (
  user_id     TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  cadence     TEXT NOT NULL DEFAULT 'daily',
  greeting_at INTEGER,
  updated_at  INTEGER NOT NULL
);

-- Task signals, not task status. `42` forbids a cached status because a stored
-- status and the underlying work drift apart, and the person is then shown "done"
-- over a failed run. These are the raw facts `deriveTaskState` projects from.
CREATE TABLE IF NOT EXISTS tasks (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL,
  owner_user_id        TEXT NOT NULL,
  agent_id             TEXT NOT NULL,
  title                TEXT NOT NULL,
  why                  TEXT,
  -- Derived-state inputs. Each is a fact, not an interpretation.
  open_question        INTEGER NOT NULL DEFAULT 0,
  blocked_on_approval  INTEGER NOT NULL DEFAULT 0,
  failed_after_retries INTEGER NOT NULL DEFAULT 0,
  running              INTEGER NOT NULL DEFAULT 0,
  finished_unresolved  INTEGER NOT NULL DEFAULT 0,
  resolved_at          INTEGER,
  attempts             INTEGER NOT NULL DEFAULT 0,
  max_attempts         INTEGER NOT NULL DEFAULT 3,
  last_error           TEXT,
  created_at           INTEGER NOT NULL,
  updated_at           INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS tasks_by_triage
  ON tasks (workspace_id, resolved_at, created_at);
