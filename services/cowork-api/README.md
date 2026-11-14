# EdApex — Cowork API

The agent-side backend: agent state, device sync, approvals and connectors. A
Cloudflare Worker that **never** touches school records.

| | |
|---|---|
| Worker | `edapex-cowork-api` |
| Owns | `AGENT_DB` (D1), `SYNC_MEDIA` (R2) |
| Must never bind | the school `DB` |
| Verifies identity via | service binding to `services/sms-api` |
| Calls | `services/model-router` over a service binding |

**Status: chunk 2 lands the sync channel** — device registry, encrypted event
push, cursor-based pull. Approvals, connectors and quota arrive in chunks 3-5.

## The separation, and why it is physical

`cowork-api` and `sms-api` are two Workers with two databases. A D1 binding is
per-Worker, so `cowork-api` **cannot** query school records even if someone writes
the code to try. That is a deployment fact rather than a lint rule, which is why
the split is worth the extra deploy target.

| Concern | Home |
|---|---|
| Students, marks, attendance, report settings | `sms-api` (`DB`) |
| Agent threads, messages, devices, sync cursors | `cowork-api` (`AGENT_DB`) |
| Provider credentials, model routing | `model-router` (no D1) |

## Identity

`cowork-api` never validates a cookie itself. It forwards the session token to
`sms-api` over a service binding and uses the returned identity. Two consequences
worth keeping:

- There is exactly **one** implementation of session validation in the system.
- `model-router` can be told who is calling without ever being able to
  authenticate anyone on its own.

`model-router` receives the resolved identity as forwarded headers plus a shared
secret. It never sees the user's session token.

## Reachability — decided

The session cookie is `__Host-edapex_session`. A `__Host-` cookie is bound to the
**exact host** that set it and cannot carry a `Domain`, so the browser-facing
route must terminate on `api.llacademy.ng`.

Resolved as: **`sms-api` owns the browser entry for model traffic.**
`POST /api/v1/agent/model/chat/completions` is a thin passthrough that
resolves the session, stamps the caller identity, and forwards over a service
binding to `model-router`. It is mounted **outside** the tenant middleware so a
workspace with no school can still run an agent.

Why not the path-split alternative: it would require converting `sms-api` from
`custom_domain` to a zone route, and it would duplicate session handling in a
second Worker. The passthrough reuses the one existing implementation and never
carries a credential.

This Worker therefore still has **no public route** of its own; browser traffic
reaches it through `sms-api` once chunk 2 adds the agent state it serves.

## Sync channel

The device owns the plaintext. This Worker stores and routes ciphertext and never
holds a key, so a compromised Worker cannot read a transcript.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/agent/devices` | This account's devices, newest first |
| `POST` | `/api/v1/agent/devices` | Register a device and its public key |
| `DELETE` | `/api/v1/agent/devices/:id` | Revoke (tombstone, not delete) |
| `POST` | `/api/v1/agent/sync/push` | Accept a batch of sealed events |
| `GET` | `/api/v1/agent/sync/pull` | Events for the workspace since a cursor |

Every route requires the `__Host-edapex_session` cookie and is scoped to its
`user.id`. Another account's device id resolves to `device_unknown`, never to that
device.

### Push

- **Idempotent by the database**, not by application bookkeeping:
  `UNIQUE (device_id, device_seq)` plus `INSERT OR IGNORE` means a retry after a
  timeout accepts nothing new.
- **One batch per push.** The events, the device heartbeat and the cursor commit
  together, so a cursor can never advance past events that were not stored.
- **Checksum verified before writing.** SHA-256 over the raw ciphertext catches
  truncation and transport corruption, which would otherwise only surface as a
  decryption failure on the far device.
- `entityType` is an allowlist. `students`, `marks` and similar are rejected at
  validation, before a statement is prepared.

### Pull

The cursor is an opaque `"<receivedAt>:<id>"`. Ordering uses **the server's**
`received_at`, not the client's `created_at`: a device with a wrong clock would
otherwise write events that sort behind another device's cursor and are never
pulled.

A short page does not advance the cursor past what it returned, so a limited read
cannot silently skip the remainder.

| Column | Note |
|---|---|
| `created_at` | The client's clock, per `42-agent-db-schema.md`; never used for ordering |
| `received_at` | Server receive time; the pull order. Server-assigned so ordering cannot be influenced by the client |

## Bindings

| Binding | Type | Purpose |
|---|---|---|
| `AGENT_DB` | D1 | Devices, events, cursors |
| `SYNC_MEDIA` | R2 | Encrypted snapshots and update blobs |
| `SMS_API` | Service | Session validation only |

Chunk 3 adds a service binding to `model-router` and the approvals queue.

`AGENT_DB` is bound only here. The school `DB` is not bound to this Worker, so the
separation is a deployment fact rather than a lint rule.

## Budget constraints that shape the design

- **50 queries per Worker invocation on Free**, but `db.batch()` counts as one.
  Bulk writes must be batched, and `db.batch` caps at 100 statements, so anything
  larger is chunked with checkpoints.
- **D1 allows 100,000 rows written per day** on Free. A per-token or per-request
  write design will exhaust that; quota and sync counters checkpoint on an
  interval instead.
- **D1 storage is 500 MB per database.** A `TenantDatabase` resolver becomes
  necessary near ~400 MB or on a residency requirement; until then rows carry
  `school_id` and every query is scoped.

## Working rules

- No cross-service runtime import, and no `db/schema` import crossing a boundary.
- Every query is tenant-scoped; there is no fallback tenant.
- Agent persistence lives in `AGENT_DB`. School tables never appear in its
  migrations.
- Approvals are server-authoritative. The UI never auto-approves.

## Quickstart

```bash
pnpm exec tsc --noEmit
pnpm exec tsc --noEmit -p tests/tsconfig.json
pnpm exec vitest run
pnpm exec wrangler dev
```

Before the first deploy, create the database and replace the placeholder id in
`wrangler.jsonc`:

```bash
pnpm exec wrangler d1 create edapex-agent
```

`pnpm-workspace.yaml` lists this directory, so `pnpm install` must run at the root
after adding it.
