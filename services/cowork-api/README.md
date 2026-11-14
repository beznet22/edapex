# EdApex — Cowork API

The agent-side backend: agent state, device sync, approvals and connectors. A
Cloudflare Worker that **never** touches school records.

| | |
|---|---|
| Worker | `edapex-cowork-api` |
| Owns | `AGENT_DB` (D1), `SYNC_MEDIA` (R2) — *added in chunk 2* |
| Must never bind | the school `DB` |
| Verifies identity via | service binding to `services/sms-api` |
| Calls | `services/model-router` over a service binding |

**Status: skeleton.** The Worker config and package exist so the boundary is
real; routes and bindings land with each chunk.

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

## Bindings, by chunk

| Chunk | Binding |
|---|---|
| 2 | `AGENT_DB` (D1), `SYNC_MEDIA` (R2), service binding → `sms-api` |
| 3 | service binding → `model-router`, approvals queue |
| 5 | connectors and the tenant package |

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
pnpm exec vitest run
pnpm exec wrangler dev
```

`pnpm-workspace.yaml` lists this directory, so `pnpm install` must run at the root
after adding it.
