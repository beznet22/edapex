# 41 — Storage, Memory and Cross-Device Sync

**Draft.** Defines local-first persistence and the EdApex boundary. No implementation in Phase 9B.

## Three stores, three authorities

Do not collapse these into one CRDT database.

| Data | Authority | Local copy? |
|---|---|---|
| EdApex school records (students, marks, parents, attendance) | CF Workers + D1/R2 | **No durable local copy** |
| User session/token | CF Workers/D1 | Only the client credential in Keychain/Keystore; never synced |
| Agent session, tasks, approvals, memory, artifacts | Local device | Yes; optional encrypted sync |
| Artifact containing school data | CF Workers/R2 or ephemeral | No P2P/Yjs copy |

If “everything local-first” includes school records, it contradicts “EdApex data and sessions only on CF Workers.” Keep the boundary: the agent is local; EdApex records are fetched from the Worker and are ephemeral locally.

## Local store

### Tauri native (desktop/mobile)

- SQLite (encrypted at rest).
- The canonical table set is `42-agent-db-schema.md`; local tables mirror it. Core tables: `threads`, `messages`, `message_parts`, `runs`, `tool_calls`, `approval_requests`, `approval_rules`, `tasks`, `artifacts`, `artifact_versions`, `memory_facts`, `sync_events`, `sync_outbox`, `sync_cursors`. The same local schema also carries the v1 channel, Team Bot, group, delivery, connection/skill, work-item, routine-run, responsibility, artifact rendition/import/comment/sign-off and local-audit tables defined there.
- FTS for search; optional local vector index for memory.
- WAL, migrations, backup/restore.

### Web PWA

- **OPFS + SQLite WASM** if the browser supports the required headers/APIs; otherwise **IndexedDB** through a documented adapter.
- OPFS is a filesystem, not a SQL database; use SQLite WASM/wa-sqlite or an IndexedDB store.
- Keep the same logical schema as native.
- Do not use localStorage for chat history/memory.

### Chat store

- The chat store is EdApex-owned; there is no assistant-ui runtime, adapter or assistant-cloud.
- Persist threads, messages, typed `message_parts`, runs, tool calls, `approval_requests` and surface metadata in the same local transaction.
- A `surface` part stores OpenUI source, catalog version, data class and expiry; it does **not** store an `edapex-ephemeral` PII snapshot.
- Artifact renditions follow `data_class`: `workspace` may be local/synced; `edapex` is Worker/R2 only; `edapex-ephemeral` is memory/download only.
- `artifact_imports` store parser/warning metadata; the source file keeps its own data class.
- Comments/mentions/sign-offs are metadata; staff-only mentions in v1, no student PII in free text.
- Do **not** use AI SDK `UIMessage` rows; the xcodex adapter defines the message-part contract.
- The local SQLite and IndexedDB/OPFS stores implement the same logical schema from `42-agent-db-schema.md`.

## Sync architecture

### CRDT selection

| State | Representation |
|---|---|
| Chat messages/runs/tool calls | Append-only event log with stable IDs, device ID, timestamps, tombstones |
| Tasks/approvals | State machine + event log, not free-form CRDT text |
| Memory facts | Versioned records with explicit merge rules |
| Artifact documents/notes | Yjs/Automerge CRDT |
| Collaborative rich text | Yjs update stream + snapshots |
| Embeddings/vector index | Local rebuild per device; do not sync opaque binary indexes by default |

Yjs is not appropriate for the entire database. Chat ordering, approval state and tool outcomes need explicit state machines; only mutable documents need CRDT merging.

### Local write path

1. Write local SQLite transaction.
2. Append to `sync_outbox` in the same transaction.
3. A sync worker batches encrypted updates.
4. Update `sync_cursors` only after durable remote acknowledgment.
5. Retries are idempotent by operation/device sequence ID.

### Cloud sync

Use CF Workers for cloud sync, but not D1 as a high-frequency CRDT room:

- **D1**: sync metadata, document/version index, device registry, cursors, small batched updates.
- **R2**: encrypted update blobs/snapshots.
- **Durable Object / WebSocket** if real-time collaborative editing is required.
- **HTTPS/WebSocket** from clients; iroh is the P2P transport, not the CF storage API.

A high-frequency Yjs update stream written row-by-row to D1 would consume the free write budget and add latency. Batch/compact updates and store blobs in R2 or DO storage. `AGENT_DB` is separate from the EdApex school `DB`; the two never share rows, keys or bindings.

### iroh

- iroh is transport: direct device-to-device sync, relay fallback.
- It does not provide cloud backup or asynchronous offline mailbox by itself.
- Cross-device sync when devices are not online together needs an always-on peer or a CF sync service.
- `iroh-ffi` does not expose iroh-blobs/docs; implement the protocol or wrap it.
- Use iroh only for encrypted agent state/workspace; never school records or session tokens.

## Separate D1 databases

EdApex school data and agent sync data must not share a D1 database or binding.

| Binding | Database | Contents |
|---|---|---|
| `DB` | `edapex` / `edapex-recovery` | School records, users, sessions, marks, archives metadata |
| `AGENT_DB` | `edapex-agent` (separate database) | Agent sync metadata, device registry, doc index, cursors, optional small Yjs updates |
| `SYNC_MEDIA` | separate R2 prefix/bucket | Encrypted Yjs snapshots/updates if not in D1 |

- No foreign keys or joins across `DB` and `AGENT_DB`.
- No school data or session token in `AGENT_DB`.
- The sync Worker uses `AGENT_DB`, not the EdApex `DB`.
- Separate D1 databases do **not** create separate Free-plan quota; writes still count against the account-wide 100k/day cap. Batch and compact.

## How Yjs works with D1

Yjs is a CRDT library. D1 is a relational SQLite database. D1 does not merge Yjs documents; clients do.

The canonical OpenDuet-domain schema is [`42-agent-db-schema.md`](./42-agent-db-schema.md). Yjs is not the schema; it is the body format for mutable artifacts/pages only:

- `artifacts` — artifact/page metadata and current version.
- `artifact_versions` — snapshots or content references.
- `artifact_updates` — opaque Yjs updates linked to an artifact and device sequence.
- `sync_events` — append-only state/event channel for threads, messages, tasks, approvals, agents, channels and memory.

Use Yjs only for mutable documents/artifacts:

- Client creates `Y.Doc` and encodes updates with `Y.encodeStateAsUpdate`.
- Each update is opaque binary; the client applies `Y.applyUpdate`.
- The server stores updates/snapshots; it does not attempt to resolve conflicts.
- Awareness/presence is ephemeral and should not be stored in D1.

### Yjs tables in the domain schema

The full schema is in `42-agent-db-schema.md`; the Yjs-specific tables are:

```sql
artifact_updates (
  id TEXT PRIMARY KEY,
  artifact_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  update_blob BLOB NOT NULL,
  checksum TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(artifact_id, device_id, seq)
);

sync_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL,
  revoked_at INTEGER
);

sync_cursors (
  device_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  last_seq INTEGER NOT NULL,
  PRIMARY KEY(device_id, workspace_id, scope)
);
```

Do not create a generic `agent_documents` store that bypasses the OpenDuet entities. Artifact identity, ownership, kind, version, data class and thread/task links belong in `artifacts`/`artifact_versions`.

### Flow

1. Client batches updates in a local outbox.
2. `POST /api/v1/agent-sync/push` inserts the batch into `AGENT_DB` with idempotency on `(artifact_id, device_id, seq)` for Yjs and `(device_id, device_seq)` for `sync_events`.
3. Other devices `GET /api/v1/agent-sync/pull?cursor=...` and apply domain events/Yjs updates locally.
4. Periodically compact a Yjs snapshot to R2 and update `artifacts.current_version`/`artifact_versions`.
5. Large updates/snapshots go to R2; keep D1 rows within its row-size and write limits.

Do not write one D1 row per token or per streaming delta. Batch updates. Do not rely on D1 to merge documents.

For live collaborative editing, use a Durable Object/WebSocket room that merges Yjs updates and periodically persists snapshots; D1 remains the durable index. If Durable Objects are unavailable, use the batched D1/R2 path.

## Security

- Per-user key; per-device keys; E2EE for sync payloads.
- Cloud sees ciphertext, metadata, version/cursor.
- Device pairing and revocation via CF Worker identity.
- No session tokens, cookies or EdApex records in sync.
- PII in agent memory: redact/minimize; classify; retention/deletion.
- Lost device: revoke, purge remote peer access, wipe as policy allows.
- No assistant-ui, assistant-cloud or paid persistence vendor.

## Sync flow

```text
Device A local SQLite
  ├─ write + outbox
  ├─ encrypted batch ──► CF sync Worker ──► D1 metadata + R2/DO updates
  └─ iroh direct ──────► Device B (same user, paired)

Device B local SQLite
  ├─ pull cursor
  ├─ apply updates
  └─ merge CRDT docs / replay event log
```

## Acceptance

- Local store opens and migrates on Tauri desktop/mobile and web.
- The custom chat store and message-part adapters work offline.
- No EdApex school data or session token is written to local/P2P.
- Chat/event ordering is deterministic; Yjs only for documents.
- Cloud sync batches and respects D1 write limits.
- iroh sync works with an always-on peer or documented cloud fallback.
- All sync payloads are encrypted; device revocation is tested.
