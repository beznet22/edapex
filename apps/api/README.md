# EdApex — API service

The Hono API on Cloudflare Workers with D1. This directory is the **API service** — a deployable, UI-less backend consumed by `apps/web`, `apps/desktop`, and `apps/mobile`. The legacy SvelteKit app remains in `../src` until cutover.

| | |
|---|---|
| Phase | **7 — Migration execution complete** ([PROGRESS](../docs/cloudflare-port/PROGRESS.md)) |
| Plan | [ROADMAP](../docs/cloudflare-port/ROADMAP.md) |
| Agent rules | [AGENTS.md](./AGENTS.md) |
| Specs | [docs/cloudflare-port](../docs/cloudflare-port/README.md) |

## What lands here

Only the catalog-backed backend: the 62 legacy SMS tables, the redesigned tables (auth, promotion, archive), the repository/service/HTTP layers, and their tests. Chat/Mastra and the app-db services are out of scope.

## Prerequisites

- Node.js 22 or newer
- `pnpm`
- A Cloudflare account with a D1 database
- Either a Google Cloud OAuth client with the Gmail send scope, or a Cloudflare Email Routing binding
- `wrangler` available through the workspace (no global install required)

## Quickstart

These commands run from `apps/api/`. The pinned toolchain is installed by `pnpm install`; the D1 `database_id` in `wrangler.jsonc` is a placeholder until the production database exists (Phase 7/8).

```bash
# install
pnpm install

# create the local D1 database and apply migrations
pnpm exec wrangler d1 migrations apply DB --local

# run the Worker locally
pnpm exec wrangler dev

# tests (Workers runtime, local D1)
pnpm exec vitest

# typecheck
pnpm exec tsc --noEmit

# HTTP surface guard
pnpm run check:http
pnpm run check:http:self
```

Local secrets go in `.dev.vars` (gitignored): session signing key, email provider key, Google OAuth client, and `ARCHIVE_TOKEN_SECRET` for public document links. Production secrets are set with `wrangler secret put`. **Never** commit `.dev.vars` or any data dump.

### Email delivery

Gmail OAuth2 is selected when these variables are present:

```text
GMAIL_CLIENT_ID
GMAIL_CLIENT_SECRET
GMAIL_REFRESH_TOKEN
GMAIL_SENDER_EMAIL
GMAIL_SENDER_NAME        # optional display name
```

The refresh token is created once with `access_type=offline`, `prompt=consent`, and the `https://www.googleapis.com/auth/gmail.send` scope. The adapter refreshes the access token with the OAuth2 refresh-token grant and sends raw RFC 2822 MIME through `gmail/v1/users/{sender}/messages/send`; no Google SDK is required.

If the `GMAIL_*` variables are absent, the service falls back to the Cloudflare Email Routing `send_email` binding (`EMAIL` / `EMAIL_FROM`). The current Gmail configuration is deployment-level (one sending account); per-school Gmail connections require encrypted credential storage and an OAuth callback in a later phase. Gmail sending quotas and app-verification requirements apply.

### Student photos

Student photos live in R2 Standard bucket `edapex-media` (binding `MEDIA`) under the key `uploads/students/<sha256>.<ext>`. The database keeps the unchanged relative URL `/uploads/students/<sha256>.<ext>`, and a public content-addressed route serves it with immutable caching. The bucket stays private.

```bash
pnpm exec wrangler r2 bucket create edapex-media
```

`static/uploads/students` remains the legacy fallback until the Phase 7 data upload; only images are in scope. The Phase 7 rehearsal inventories the referenced photos, uploads them to local R2 under the unchanged `/uploads/students/...` keys and verifies the public route. The directory also contains PDFs, which are not student photos and are excluded — see `05 §5.1`.

### Archive objects

Session archives reuse the `edapex-media` bucket under a separate namespace:

```text
schools/{schoolId}/sessions/{sessionId}/students/{studentId}/v{version}.json
schools/{schoolId}/sessions/{sessionId}/manifest.json
```

Each object is canonical JSON carrying `schemaVersion`, `meta`, `placement`, `terms`, `marksheets`, `transcript`, `photoKey` and the raw assessment rows. The SHA-256 checksum is recorded in `archive_objects` and re-verified on every read; a mismatch quarantines the object instead of aborting the job. Public document links are signed with `ARCHIVE_TOKEN_SECRET` and are revocable through `POST /api/v1/admin/tokens/:tokenId/revoke`.

## Deploy

```bash
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy
```

Deployment is gated by the cutover phase; do not deploy to production from a feature branch. The production sequence, placeholders and stop/go gates are in [`docs/cloudflare-port/cutover/runbook.md`](../../docs/cloudflare-port/cutover/runbook.md). The current target is a **fresh** D1/R2 load from the final frozen snapshot; no production database exists yet.

## Layout

| Path | Contents |
|---|---|
| `wrangler.jsonc` | D1 binding, `nodejs_compat`, compatibility date |
| `src/worker.ts` | Worker entry, exports `app` |
| `src/lib/server/http/` | `app.ts`, middleware, routes, schemas, DTOs |
| `src/lib/server/repository/` | data access, one folder per aggregate |
| `src/lib/server/services/` | orchestration, ports, adapters, pure domain |
| `src/lib/server/db/` | schema, migrations, seed |
| `src/lib/http/client.ts` | `hc<AppType>` browser client |
| `tests/` | Workers-pool tests |

`src/lib/...` mirrors the legacy alias structure on purpose: the repository migration map transfers without rewriting imports.

## Working rules (summary)

The full set is in [AGENTS.md](./AGENTS.md); these are the ones that break builds:

- 62 legacy tables only; new tables must be declared in a spec.
- No `any`; explicit return types.
- No `db.transaction()` — `db.batch` only; chunked binds (≤100 parameters).
- Every query is tenant-scoped; no fallback tenant.
- Repository ≤300 lines, service ≤400, route module ≤300, domain ~200.

## HTTP surface

The API is service-led: each route maps to one service method under `/api/v1`, and the browser client is `hc<AppType>` from `src/lib/http/client.ts`. Tenant scope travels in `X-Academic-Id`, `X-Class-Id`, and `X-Section-Id`; the public surface is `/health`, the content-addressed `/uploads/students/:file` route, and `/r/:token`. PDF rendering is client-side via ironpress; the API's `…/pdf` routes return `{ templateVersion, version, publishedAt, filename, document }`, and the API keeps result/transcript email publishing.

## Testing

- Unit and contract tests run under `@cloudflare/vitest-plugin`, against a local D1.
- Route tests use `app.request()` — no server, no port.
- Migration tests assert table count, column caps, index count, and `PRAGMA foreign_key_check`.

## Before opening a PR

```bash
# from the repository root
node scripts/verify-port-specs.mjs
node scripts/verify-schema-catalog.mjs
```

Then update [PROGRESS.md](../docs/cloudflare-port/PROGRESS.md): status row, gate checkboxes, change-log line.

## Status

Phases 0–7 are complete. Phase 8 preparation adds the cutover runbook/checklist/monitoring/on-call/rollback pack, a dump preflight and a local application drill; no remote D1/R2/DNS/MySQL action has been taken and PR #8 remains unmerged. The preflight loads the current snapshot into a disposable local D1 (62 tables, 196,801 rows, zero FK/reconciliation failures) and emits reviewed remote command lists. The drill exercises claim disabled/enabled/rollback, target integrity, staffing, teacher roster, marks entry and report-card review on a copy of the Phase 7 D1. See [`docs/cloudflare-port/cutover/README.md`](../../docs/cloudflare-port/cutover/README.md) and [`scripts/migration/README.md`](./scripts/migration/README.md).
