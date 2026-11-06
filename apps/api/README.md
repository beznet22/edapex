# EdApex — API service

The Hono API on Cloudflare Workers with D1. This directory is the **API service** — a deployable, UI-less backend consumed by `apps/web`, `apps/desktop`, and `apps/mobile`. The legacy SvelteKit app remains in `../src` until cutover.

| | |
|---|---|
| Phase | **4 — HTTP layer complete; PR #5** ([PROGRESS](../docs/cloudflare-port/PROGRESS.md)) |
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

Local secrets go in `.dev.vars` (gitignored): session signing key, email provider key, Google OAuth client. Production secrets are set with `wrangler secret put`. **Never** commit `.dev.vars` or any data dump.

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

`static/uploads/students` remains the legacy fallback until the Phase 7 migration; only images are in scope. The directory also contains PDFs, which are not student photos and are excluded — see `05 §5.1`.

## Deploy

```bash
pnpm exec wrangler d1 migrations apply DB --remote
pnpm exec wrangler deploy
```

Deployment is gated by the cutover phase; do not deploy to production from a feature branch.

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

The API is service-led: each route maps to one service method under `/api/v1`, and the browser client is `hc<AppType>` from `src/lib/http/client.ts`. Tenant scope travels in `X-Academic-Id`, `X-Class-Id`, and `X-Section-Id`; the public surface is `/health` and the content-addressed `/uploads/students/:file` route. PDF rendering is client-side; the API owns result and transcript email publishing only.

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

Phases 0–4 are complete. Phase 3 added the request-scoped service context, ports/adapters, pure domain and semantic validation, the five catalog-facing service groups, OCR cache/capture binding, settings, auth/session/profile/rate limiting, authorization and student lifecycle. Phase 4 adds the service-led `/api/v1` surface, the flat error envelope, the `baseCtx`/`ctx` split, the `hc<AppType>` client and the HTTP guard. The local gate reports 80 test files / 399 tests, 77 tables (62 legacy + 15 registered), 53/53 mapped service methods, 19 HTTP route modules, clean boundaries/repository/service/HTTP guards, schema drift clean and both verifiers green.
