# 42 — AGENT_DB Schema: OpenDuet-Domain Model

**Draft.** Canonical logical schema for local agent state and the separate cloud `AGENT_DB`. No implementation in Phase 9B.

## Principle

The agent database is **not** a generic document/Yjs store. It is an OpenDuet-domain schema, with EdApex extensions. Yjs is only the body format for mutable artifacts/pages.

- Local SQLite/OPFS is the primary agent store.
- Cloud `AGENT_DB` is a separate D1 database/projection for sync.
- EdApex school D1 `DB` is never joined, copied or mixed with `AGENT_DB`.
- No user session tables, cookies or password credentials here.

## Agent creation policy

`agents` and `agent_profiles` are user-creatable, so creation is a permission change and needs an explicit policy. The normative rules live in `10-capabilities-and-roles.md` §Agents and grants; this spec owns the persisted shape.

- An agent's grant set is stored as `AgentGrant` records. It is always a **subset** of its creator's capability ceiling — see the narrowing invariant in `10`.
- Persist the **ceiling snapshot** the grants were validated against (`validated_against`), so a later role change or feature disable can be detected and re-resolved rather than silently trusted.
- A grant that no longer resolves against the current ceiling is **dropped**. It is never widened and never silently retained.
- Remote agents (`agents.kind = 'remote'`, AG-UI endpoints) require explicit admin approval; their grants are never derived from the creator.
- `agents.yaml` package rows are seeded with `origin = 'package'` and are non-deletable. User rows use `origin = 'user'`.
- Creation is plan-then-apply. The server resolves candidate grants and reports exceedances; it does not trim silently, and nothing is auto-applied.

`TenantFeature` gates which capability areas are on for the tenant. Feature filtering happens **before** the 5-tool cap, so a disabled area never consumes a tool slot.

## Verified OpenDuet core

The OpenDuet source schema contains, among others:

- `agents`
- `channels`, `channel_agents`, `channel_memberships`
- `group_bot_threads`, `group_messages`
- `openduet_channels`
- `openduet_tasks` (no status column; status is derived)
- `openduet_pages` (page/slides/dashboard/doc/design/design-system)
- `approval_requests`, `approval_rules`, `approval_preferences`, `approval_team_settings`
- `skills`, `skill_tools`, `plugin_grants`
- `personal_memories`, `memory_sources`
- `routines`, `routine_runs`
- `proactive_suggestions`
- `attachments`
- `delivery_inbox`, `delivery_outbox`
- `action_records`, `audit_events`
- `capability_settings`

This schema is PostgreSQL/Drizzle. `AGENT_DB` is SQLite/D1; the logical entities are preserved, not the PostgreSQL-specific types.

## Minimal core tables

### Workspace and actors

```sql
workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,       -- EdApex user id, no password/session data
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,                -- owner/admin/member
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
```

### Agents and skills

```sql
agents (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,                -- built_in/remote
  origin TEXT NOT NULL,              -- package/user
  role_description TEXT,
  system_prompt_ref TEXT,
  model_config_json TEXT,            -- no provider keys
  status TEXT NOT NULL,
  created_by TEXT,                   -- user id; null for package rows
  validated_against TEXT,            -- ceiling snapshot the grants were resolved against
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

agent_profiles (
  agent_id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  title TEXT NOT NULL,
  role_description TEXT NOT NULL,
  avatar_seed TEXT NOT NULL,
  visibility TEXT NOT NULL,          -- public/team/private
  callback_token_hash TEXT,           -- hash only; never the token
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

agent_preferences (
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  hidden_at INTEGER,
  pinned_at INTEGER,
  PRIMARY KEY (user_id, agent_id)
);

skills (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  instructions TEXT NOT NULL,
  origin TEXT NOT NULL,              -- catalogue/yours
  installed_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, slug)
);

-- Skill grants use plugin_grants with kind='skill'. There is no second grant table.
```

### Channels and threads

```sql
channels (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

channel_agents (
  channel_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  PRIMARY KEY (channel_id, agent_id)
);

channel_memberships (
  channel_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  pinned_at INTEGER,
  last_read_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (channel_id, user_id)
);

channel_looks (
  channel_id TEXT PRIMARY KEY,
  icon TEXT NOT NULL,
  colour TEXT NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT,
  agent_id TEXT NOT NULL,
  title TEXT,
  source TEXT NOT NULL,              -- chat/task/suggestion/check_in
  last_message_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
```

OpenDuet separates the task's own conversation from the channel it came from; preserve `threads.channel_id` and `tasks.from_channel_id` separately.

### Messages, parts, runs, tool calls

```sql
messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  parent_id TEXT,
  role TEXT NOT NULL,                -- user/assistant/system/tool
  format TEXT NOT NULL,
  content_json TEXT NOT NULL,
  data_class TEXT NOT NULL,          -- workspace|edapex-ephemeral
  device_id TEXT,
  device_seq INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL
);

runs (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  usage_json TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

tool_calls (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  message_id TEXT,
  tool_name TEXT NOT NULL,
  input_json TEXT,
  output_json TEXT,
  status TEXT NOT NULL,              -- running/completed/failed/blocked/declined
  approval_request_id TEXT,
  error TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER
);

message_parts (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  part_type TEXT NOT NULL,            -- text/thinking/tool/approval/surface/artifact
  content_json TEXT NOT NULL,         -- typed payload; surface has source/catalogVersion/dataClass/expiresAt
  data_class TEXT NOT NULL,           -- workspace|edapex-ephemeral
  created_at INTEGER NOT NULL,
  UNIQUE (message_id, ordinal)
);
```

`messages.data_class = edapex-ephemeral` must not be synced to cloud or iroh. Redact or retain only locally under policy. A `surface` part stores the OpenUI source, catalog version and expiry, never an `edapex-ephemeral` school-data snapshot.

### Approvals

```sql
approval_requests (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  action_digest TEXT NOT NULL,
  action_json TEXT NOT NULL,
  status TEXT NOT NULL,              -- pending/approved/denied/consumed/completed
  decision TEXT,                     -- allow_once/allow_always/deny/handled
  result_json TEXT,
  created_at INTEGER NOT NULL,
  decided_at INTEGER,
  consumed_at INTEGER,
  completed_at INTEGER,
  UNIQUE (owner_user_id, run_id, tool_call_id)
);

approval_rules (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  tool_ref TEXT NOT NULL,
  effect TEXT NOT NULL,
  scope TEXT NOT NULL,
  behaviour TEXT NOT NULL,           -- allow/pre_approved/ask/hand_off
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
```

The server remains authoritative for approval tokens and EdApex mutations. The agent DB stores local decision state for UI/sync.

```sql
approval_preferences (
  owner_user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  auto_review INTEGER NOT NULL DEFAULT 0,
  host_commands TEXT NOT NULL DEFAULT 'ask',   -- ask/allow/never
  updated_at INTEGER NOT NULL
);

approval_team_settings (
  id TEXT PRIMARY KEY,                        -- singleton 'team'
  enforce_auto_review INTEGER NOT NULL DEFAULT 0,
  custom_rules_enabled INTEGER NOT NULL DEFAULT 1,
  host_commands_cap TEXT NOT NULL DEFAULT 'allow',
  updated_by TEXT,
  updated_at INTEGER NOT NULL
);

approval_team_rules (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  tool_ref TEXT NOT NULL,
  effect TEXT NOT NULL,
  scope TEXT NOT NULL,
  behaviour TEXT NOT NULL,                   -- allow/pre_approved/ask/hand_off
  created_by TEXT,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
```

### Tasks and questions

```sql
tasks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  from_channel_id TEXT,
  title TEXT NOT NULL,
  why TEXT,
  origin TEXT NOT NULL,              -- asked/suggestion/check_in
  suggestion_id TEXT,
  source_app TEXT,
  source_link TEXT,
  thumbnail TEXT,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

task_questions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  answered_at INTEGER
);
```

Do not add a cached task `status`; derive it from work items, approvals and questions as OpenDuet does.

### Make pages and artifacts

```sql
artifacts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT,
  task_id TEXT,
  channel_id TEXT,
  kind TEXT NOT NULL,                -- page/slides/dashboard/doc/design/design-system/document/report/data/pdf/docx/code/react/html/image
  title TEXT NOT NULL,
  summary TEXT,
  thumbnail TEXT,
  theme TEXT,
  content_format TEXT NOT NULL,      -- markdown|tiptap-json|page-json|report-json|csv|pdf|docx|html|code|yjs
  source_format TEXT NOT NULL,       -- markdown|page-json|report|csv|pdf|docx|html
  current_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,              -- streaming/ready/editing/saving/error/archived
  data_class TEXT NOT NULL,          -- workspace|edapex|edapex-ephemeral
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

artifact_versions (
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_ref TEXT,                  -- local file/R2 key
  content_json TEXT,
  checksum TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, version)
);

artifact_updates (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  update_blob BLOB NOT NULL,
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (artifact_id, device_id, seq)
);

artifact_renditions (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  format TEXT NOT NULL,              -- pdf/docx/csv/html/png
  mime_type TEXT NOT NULL,
  store_key TEXT NOT NULL,
  checksum TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  status TEXT NOT NULL,              -- queued/rendering/ready/error
  template_version TEXT,
  data_class TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (artifact_id, version, format, template_version)
);

artifact_imports (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source_attachment_id TEXT,
  source_format TEXT NOT NULL,       -- docx/pdf/csv/markdown
  parser TEXT NOT NULL,
  parser_version TEXT NOT NULL,
  warnings_json TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

artifact_comments (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  parent_id TEXT,
  anchor_json TEXT NOT NULL,         -- ProseMirror position/range; never PII
  body TEXT NOT NULL,
  author_user_id TEXT NOT NULL,
  resolved_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

artifact_comment_mentions (
  comment_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (comment_id, user_id)
);

artifact_tasks (
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  block_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (artifact_id, version, block_id)
);

artifact_signoffs (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  block_id TEXT NOT NULL,
  signer_user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL,              -- pending/signed/declined
  signed_at INTEGER,
  approval_request_id TEXT,
  created_at INTEGER NOT NULL
);
```

Yjs applies only to `artifact_updates`/artifact bodies. It is not the schema for threads, tasks, approvals or memory.

### Memory

```sql
memory_facts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_id TEXT,
  scope TEXT NOT NULL,               -- user/agent/workspace
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  source_ref TEXT,
  confidence REAL,
  data_class TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

memory_sources (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

Embeddings/vector indexes are local derivatives, not synced as opaque blobs. Rebuild them per device or store a model-specific index separately.

### Connections, routines, proactive work

```sql
connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  account_ref TEXT,
  status TEXT NOT NULL,
  scopes_json TEXT,
  credential_ref TEXT,               -- never a secret value
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

routines (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  schedule TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  next_run_at INTEGER,
  last_run_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

proactive_suggestions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  from_channel_id TEXT,
  title TEXT NOT NULL,
  why TEXT,
  source_ref TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

proactive_settings (
  owner_user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  cadence TEXT NOT NULL DEFAULT 'daily',
  updated_at INTEGER NOT NULL
);

work_items (
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  run_at INTEGER NOT NULL,
  claimed_by TEXT,
  lease_until INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  finished_at INTEGER,
  last_error TEXT,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, key)
);

routine_runs (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  status TEXT,                      -- succeeded/failed/skipped/waiting
  waiting_json TEXT,
  error TEXT,
  source TEXT NOT NULL              -- schedule/run_now/trigger
);
```

### Attachments and delivery

```sql
attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  thread_id TEXT,
  message_id TEXT,
  store_key TEXT NOT NULL,
  filename TEXT,
  content_type TEXT,
  bytes INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  data_class TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

delivery_bindings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  transport TEXT NOT NULL,
  identity TEXT NOT NULL,
  realm TEXT NOT NULL,
  address TEXT NOT NULL,
  mention_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  opted_out_at INTEGER,
  created_at INTEGER NOT NULL
);

delivery_challenges (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  transport TEXT NOT NULL,
  address TEXT,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

delivery_inbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  binding_id TEXT,
  source TEXT NOT NULL,
  realm TEXT NOT NULL,
  external_id TEXT NOT NULL,
  text TEXT NOT NULL,
  state TEXT NOT NULL,
  error TEXT,
  created_at INTEGER NOT NULL
);

delivery_outbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  binding_id TEXT,
  transport TEXT NOT NULL,
  text TEXT NOT NULL,
  kind TEXT NOT NULL,                -- reply/question/approval
  request_id TEXT,
  state TEXT NOT NULL,
  provider_id TEXT,
  error TEXT,
  created_at INTEGER NOT NULL
);
```

### Team Bots and group conversations

```sql
team_bot_publications (
  agent_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  published_by TEXT NOT NULL,
  audience TEXT NOT NULL,            -- team/people
  published_at INTEGER NOT NULL
);

team_bot_audience (
  agent_id TEXT NOT NULL,
  kind TEXT NOT NULL,                -- user/group
  value TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, kind, value)
);

team_bot_assignments (
  agent_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  assigned_by TEXT NOT NULL,
  assigned_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, group_name)
);

team_bot_consents (
  user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  decision TEXT NOT NULL,            -- always/once
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, agent_id, server_id)
);

team_bot_consent_defaults (
  user_id TEXT NOT NULL,
  server_id TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, server_id)
);

group_bot_threads (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

group_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  sender_type TEXT NOT NULL,         -- person/bot/system
  sender_id TEXT,
  content_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

### Connections, skills and grants

```sql
mcp_servers (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  vendor TEXT NOT NULL,
  url TEXT NOT NULL,
  provenance TEXT NOT NULL,          -- first-party/custom
  credential_ref TEXT,               -- never a secret value
  status TEXT NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL
);

mcp_tools (
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,
  vendor_name TEXT,
  description TEXT NOT NULL DEFAULT '',
  input_schema_json TEXT NOT NULL,
  PRIMARY KEY (server_id, name)
);

skill_tools (
  skill_id TEXT NOT NULL,
  ref TEXT NOT NULL,
  declared_by TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (skill_id, ref)
);

plugin_grants (
  kind TEXT NOT NULL,                -- mcp/skill
  ref TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  granted_by TEXT,
  granted_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, ref, agent_id)
);

-- Capability operations granted to an agent. Each row must resolve against the
-- creator's ceiling (10-capabilities-and-roles.md §Narrowing invariant).
agent_capability_grants (
  agent_id TEXT NOT NULL,
  tool_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  validated_against TEXT NOT NULL,   -- ceiling snapshot; recheck when it changes
  PRIMARY KEY (agent_id, tool_id, operation_id)
);

-- Tenant feature mask. Filters the tool set before the 5-tool cap.
tenant_features (
  workspace_id TEXT NOT NULL,
  feature_id TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, feature_id)
);
```

### Responsibilities

```sql
responsibilities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  channel_id TEXT,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL,
  status TEXT NOT NULL,
  subscriptions_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

responsibility_events (
  id TEXT PRIMARY KEY,
  responsibility_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (responsibility_id, source, source_event_id)
);

responsibility_runs (
  id TEXT PRIMARY KEY,
  responsibility_id TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL,
  continuation_json TEXT,
  error TEXT,
  created_at INTEGER NOT NULL,
  finished_at INTEGER
);

responsibility_source_bindings (
  id TEXT PRIMARY KEY,
  responsibility_id TEXT NOT NULL,
  source TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

responsibility_triggers (
  id TEXT PRIMARY KEY,
  responsibility_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  config_json TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
```

### Local agent audit

```sql
agent_audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  actor_user_id TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  payload_json TEXT NOT NULL,
  data_class TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
```

`agent_audit_events` is local-only and must not contain school PII. EdApex mutation audit remains authoritative in the CF Worker/D1 audit path. Do not use this table as the school audit trail.

### Sync tables

```sql
sync_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_seen_at INTEGER,
  revoked_at INTEGER
);

sync_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,           -- create/update/delete/tombstone
  payload_json TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (device_id, device_seq)
);

-- Local-only outbox; never uploaded as a table. The cloud receives batched sync_events.
sync_outbox (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (device_id, device_seq)
);

sync_cursors (
  device_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  last_seq INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, workspace_id, scope)
);
```

`sync_events` is the append-only state/event channel for chat, tasks, approvals, agents, channels and memory. Yjs updates use `artifact_updates` for documents only. Both are encrypted before leaving the device.

## EdApex extension tables

These are logical extensions, not a copy of school records:

```sql
edapex_capability_grants (
  workspace_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  role_scope TEXT NOT NULL,
  granted_by TEXT NOT NULL,
  granted_at INTEGER NOT NULL,
  revoked_at INTEGER,
  PRIMARY KEY (workspace_id, agent_id, capability_id)
);

edapex_issue_refs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  external_issue_id TEXT NOT NULL,   -- opaque EdApex issue reference, no PII
  status TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
```

School data itself stays in the EdApex `DB`; `edapex_issue_refs` stores only IDs/status for local task UI.

## Projections and exclusions

Some OpenDuet tables are represented by an existing EdApex table, not copied one-for-one:

| OpenDuet entity | EdApex treatment |
|---|---|
| `openduet_tasks` | `tasks` |
| `openduet_pages` | `artifacts` with page/slides/dashboard/doc/design/design-system kinds |
| `openduet_channels` | `channel_looks` |
| `users`, people, students, parents, staff | EdApex Worker/D1; never `AGENT_DB` |
| Admin audit/action records | EdApex Worker/D1; local agent audit uses `agent_audit_events` |
| Activity view | Projection over `agent_audit_events`, `sync_events`, runs and delivery state |
| `capability_settings` | Worker capability registry; local cache is `edapex_capability_grants` |
| `action_records`, `audit_events` | CF Worker/D1 mutation audit, not `AGENT_DB`; local agent audit uses `agent_audit_events` |
| `routine_sweeps` | Operational queue detail; `work_items` carries the durable queue |
| `push_devices` | Deferred until mobile push notifications are implemented |
| `components`, `sandboxed_components` | Not copied; OpenUI uses a static, host-owned catalog |
| `composio_connections`, `brokered_connections` | Paid brokers remain out of v1. A **governed MCP client we run ourselves** in `services/cowork-api` is in scope (`60-security-privacy.md`); its server records are `mcp_servers`, `mcp_tools` and `plugin_grants`. |

## What is not in `AGENT_DB`

- EdApex users/passwords/sessions/cookies
- student records, marks, parents, attendance or archive objects
- school audit records
- provider/API secrets or encrypted credentials
- SCIM, SSO, enterprise settings, network policies or model-usage telemetry
- computers, voice, learning, shared-use approvals/requests or demonstrations
- saved passwords/sign-in requests
- deployment packages, intelligence channel mappings or Component Playground
- Composio/Arcade/brokered connections (a self-run governed MCP client is in scope; its brokered credentials are not stored here)
- opaque vector indexes by default

## Sync mapping

| Table | Sync |
|---|---|
| `messages`, `message_parts`, `runs`, `tool_calls`, `approval_requests`, `tasks`, `task_questions` | `sync_events` append-only |
| `agents`, `agent_profiles`, `agent_preferences`, `channels`, `channel_memberships`, `channel_looks`, `skills`, grants, routines, connections, memory, `approval_preferences`, `approval_team_settings`, `approval_team_rules`, `proactive_settings` | `sync_events` |
| `agent_capability_grants`, `tenant_features` | `sync_events`; re-resolved against the local ceiling before use |
| `team_bot_*`, `group_bot_threads`, `group_messages` | `sync_events` |
| `delivery_bindings`, `delivery_challenges`, `delivery_inbox`, `delivery_outbox` | `sync_events`; provider payloads remain opaque |
| `mcp_servers`, `mcp_tools`, `skill_tools`, `plugin_grants` | `sync_events`; credential refs only |
| `work_items`, `routine_runs`, `responsibilities*` | `sync_events` metadata; no school PII |
| `artifacts`/pages | `sync_events` metadata + `artifact_updates` Yjs |
| `artifact_renditions` | metadata only when `workspace`; blobs in R2/local; never for `edapex`/`edapex-ephemeral` |
| `artifact_imports` | metadata/warnings only; source attachment stays in its data class |
| `artifact_comments`, `artifact_comment_mentions`, `artifact_tasks`, `artifact_signoffs` | `sync_events` metadata; staff-only mentions; no school PII |
| `attachments` | metadata only; blobs in R2 |
| `agent_audit_events` | local-only unless a redacted subset is explicitly approved |
| `data_class=edapex-ephemeral` | **never synced** |

## Acceptance

- Every v1 OpenDuet surface has a table, projection or explicit exclusion.
- `message_parts` stores typed surfaces and never an `edapex-ephemeral` PII snapshot.
- `artifact_renditions` are version-bound and data-class enforced; no school-data PDF/DOCX/CSV is synced.
- `artifact_imports` preserve parser/warning provenance; imports never create authoritative records.
- Comments/mentions/sign-offs are metadata; student mentions are not free-text mentions.
- `41-storage-sync.md` and this document use the same table names; there is no duplicate `approvals` or `delivery_items`.
- Yjs is linked to an artifact/page, not used as the database schema.
- `AGENT_DB` is separate from EdApex D1 and contains no school records/sessions.
- Chat/task/approval state uses events/state machines, not Yjs.
- Local and cloud schemas share the same logical model.
