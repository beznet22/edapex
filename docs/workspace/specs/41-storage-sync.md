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

### Encryption

- Native and web use **one scheme**: plain SQLite plus **per-record XChaCha20-Poly1305**.
- SQLCipher is **not** used. It costs an extra per-ABI native binary, adds a second crypto stack that would diverge from web, and its value over per-record encryption is small when every record already carries a distinct key and nonce.
- Per-user key material is derived on-device; per-device wrapping keys are registered with the sync service. The server stores ciphertext and metadata only.
- The **FTS index is derived data and is not encrypted**. Treat it as a local-only cache: it is rebuildable from the encrypted records and must never be synced.
- Secrets (provider keys, connector credentials) never enter this store; they live in OS Keychain/Keystore or the server secret box.

### Tauri native (desktop/mobile)

- SQLite with the per-record encryption above, WAL and migrations.
- The canonical table set is `42-agent-db-schema.md`; local tables mirror it. Core tables: `threads`, `messages`, `message_parts`, `runs`, `tool_calls`, `approval_requests`, `approval_rules`, `tasks`, `artifacts`, `artifact_versions`, `memory_facts`, `sync_events`, `sync_outbox`, `sync_cursors`. The same local schema also carries the v1 channel, Team Bot, group, delivery, connection/skill, work-item, routine-run, responsibility, artifact rendition/import/comment/sign-off and local-audit tables defined there.
- FTS for search (derived, unencrypted, rebuildable); optional local vector index for memory.
- WAL, migrations, backup/restore.
- Every local write appends to `sync_outbox` in the **same** transaction.

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
- Do **not** use AI SDK `UIMessage` rows; the thin-core adapter defines the message-part contract (`17-chat-framework.md`).
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

### iroh — deferred

`AGENT_DB` is the **only** v1 transport. iroh is not used.

Verified against the iroh documentation: iroh is a QUIC + TLS 1.3 networking stack — key-based endpoints, NAT traversal, relay fallback, DNS/DHT lookup, with blob/doc/gossip protocols on top. It is a transport, not a store, and it has **no offline mailbox**: a powered-off peer is simply unreachable, so it cannot provide offline sync.

Three disqualifiers for v1:

1. **The PWA cannot use it.** Browser transport is WebTransport/WebRTC, not UDP. Adopting iroh would create a desktop/mobile-P2P tier that the web surface can never join, contradicting one capability set across three surfaces.
2. **It costs megabytes** of QUIC/TLS/trust-root code and contradicts the thin core's no-TLS rule. It could only ever live in a native-only `crates/sync`.
3. **Nothing in v1 needs it.** Live co-editing is the only real use, and that is deferred.

Device pairing uses a **server-issued short code / QR** and a server-issued device registration — required under any design, because device authorization is server-authoritative.

A `Transport` trait ships **unimplemented** so a future transport has a seam. CI **fails if `iroh` appears in any `Cargo.toml`**. Revisit only when live co-editing is greenlit.

## Separate D1 databases

EdApex school data and agent sync data must not share a D1 database or binding.

| Binding | Database | Contents |
|---|---|---|
| `DB` | `edapex` / `edapex-recovery` | School records, users, sessions, marks, archives metadata |
| `AGENT_DB` | `edapex-agent` (separate database) | Agent sync metadata, device registry, doc index, cursors, optional small Yjs updates |
| `SYNC_MEDIA` | separate R2 prefix/bucket | Encrypted Yjs snapshots/updates if not in D1 |

- No foreign keys or joins across `DB` and `AGENT_DB`.
- No school data or session token in `AGENT_DB`.
- The sync Worker is `services/cowork-api`, which binds `AGENT_DB` and `SYNC_MEDIA` and does **not** bind the school `DB`. It verifies identity through a Cloudflare service binding to `services/sms-api`.
- Separate D1 databases do **not** create separate Free-plan quota; writes still count against the account-wide 100k/day cap. Batch and compact.

## Routines are local-first

Routines run on the **device**, not on a Worker cron.

- The local store holds `routines` and `routine_runs`; the device executes a due routine while it is open.
- The server holds **state, dedupe keys and cursors only**. No `scheduled` handler is added to the Worker for routine fan-out.
- With a hundred tenants, a per-routine cron fan-out would exceed the account-wide 100k D1 writes/day cap. One documented incident already reached 148,861 writes in a day.
- **Accepted trade:** a routine only fires while a device is open. The UI states this; it is not presented as a server guarantee.
- Morning-brief dedupe is a **server-held key**, so two tabs or two devices still produce exactly one brief per day.

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
