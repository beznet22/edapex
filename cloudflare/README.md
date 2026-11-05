# EdApex — Cloudflare port

The Hono API on Cloudflare Workers with D1. This directory is the **target application**; the legacy SvelteKit app remains in `../src` until cutover.

| | |
|---|---|
| Phase | **0 — not started** ([PROGRESS](../docs/cloudflare-port/PROGRESS.md)) |
| Plan | [ROADMAP](../docs/cloudflare-port/ROADMAP.md) |
| Agent rules | [AGENTS.md](./AGENTS.md) |
| Specs | [docs/cloudflare-port](../docs/cloudflare-port/README.md) |

## What lands here

Only the catalog-backed backend: the 62 legacy SMS tables, the redesigned tables (auth, promotion, archive), the repository/service/HTTP layers, and their tests. Chat/Mastra and the app-db services are out of scope.

## Prerequisites

- Node.js 20 or newer
- `pnpm`
- A Cloudflare account with a D1 database (Workers **Paid** for arbitrary-recipient email)
- `wrangler` available through the workspace (no global install required)

## Quickstart

These commands become runnable once Phase 0 creates `package.json` and `wrangler.jsonc`.

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
```

Local secrets go in `.dev.vars` (gitignored): session signing key, email provider key, Google OAuth client. Production secrets are set with `wrangler secret put`. **Never** commit `.dev.vars` or any data dump.

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

## Testing

- Unit and contract tests run under `@cloudflare/vitest-pool-workers`, against a local D1.
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

Nothing is implemented yet. Phase 0 (scaffolding and guards) is the starting point; see the roadmap for its gate.
