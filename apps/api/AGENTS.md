# AGENTS.md — API service workspace

This directory is where the Hono + Cloudflare Workers + D1 application lands. **All port code goes here.** The legacy SvelteKit application stays in `src/` and is not moved.

`apps/api` is the **API service**: a deployable, UI-less backend consumed by `apps/web`, `apps/desktop`, and `apps/mobile`. `apps/` is the deployable bucket, not a frontend-only bucket.

## Read before coding

1. [`../docs/cloudflare-port/ROADMAP.md`](../docs/cloudflare-port/ROADMAP.md) — phase order, gates, working agreement.
2. [`../docs/cloudflare-port/PROGRESS.md`](../docs/cloudflare-port/PROGRESS.md) — current phase and status. **Update it in the same PR.**
3. The specs for the phase you are on, in the order the roadmap lists them.

Authority: the catalog wins for legacy tables, `05` wins for migration, the layer specs win for structure, the roadmap wins only for sequencing. If two documents conflict, stop and report.

## Expected layout

```text
apps/api/
  wrangler.jsonc            # D1 binding, nodejs_compat, compatibility_date
  src/worker.ts             # export default app
  src/lib/server/http/      # app.ts, middleware/, routes/, schemas/, dto/
  src/lib/server/repository/ # base/, accounts/, profiles/, academics/, assessments/, ...
  src/lib/server/services/  # context/, ports/, adapters/, domain/, assessment/, auth/, ...
  src/lib/server/db/        # schema, migrations, seed
  src/lib/http/client.ts    # hc<AppType>
  tests/                    # vitest-plugin
```

`src/lib/...` inside `apps/api/` is intentional: it keeps the aliases identical to the legacy tree so the repository map (`01b`) transfers without rewriting imports.

## Commands

Run from `apps/api/`:

```bash
pnpm install
pnpm exec wrangler dev                       # local Worker + local D1
pnpm exec wrangler d1 migrations apply DB --local
pnpm exec vitest                             # @cloudflare/vitest-plugin
pnpm exec tsc --noEmit
```

From the repository root, before any PR:

```bash
node scripts/verify-port-specs.mjs
node scripts/verify-schema-catalog.mjs
```

## Local capability API routes

The capability layer is defined by [`../../docs/workspace/specs/48-local-capability-layer.md`](../../docs/workspace/specs/48-local-capability-layer.md).

- `GET /api/v1/agent/capabilities` stays role-owned; do not add host features to the role manifest.
- `GET /api/v1/agent/platform-capabilities` reports only server-side flags (`webSearch`, `webFetch`, `cloudOcr`), never local host state.
- `POST /api/v1/agent/web/search` and `/web/fetch` are staff-only, tenant-scoped and rate-limited below provider free-tier caps.
- Provider keys are Worker secrets. Never return or log them, and never write search queries or fetched URLs to logs.
- `POST /api/v1/assessments/ocr/local-extractions` accepts text/annotation only. `POST /api/v1/assessments/ocr/extractions` requires `X-OCR-Consent: cloud`.
- Desktop auth uses signed PKCE and bearer sessions; do not depend on `__Host-` cookies for Tauri.
- Reuse `auth_rate_limits` for capability quotas; do not add a table to the school `DB` for this layer.

## Non-negotiables

- **62 legacy tables only** are migrated from MySQL; new tables must be declared in a spec (`04`, `05`, `06`).
- No `any`, no `as any`; explicit return types; infer from Drizzle/Zod.
- No `db.transaction()`; use `db.batch`. No raw `inArray` or multi-row `values()` outside the chunk helpers.
- Every query carries `school_id` from the request context; no fallback tenant.
- Repositories ≤300 lines, services ≤400, route modules ≤300, domain ~200.
- Repositories raise `Db*`; services raise domain errors; HTTP maps once into `{ error, message, requestId }`.
- Never commit `edapexdb.sql`, `.env*`, or any dataset containing personal data.

## Do not

- Do not modify the legacy `src/` tree unless a phase brief explicitly says so.
- Do not port the 253 unused SMS tables, the app-db services, or chat/Mastra code.
- Do not add caching, telemetry, or refactors outside the current phase.
- Do not mark a phase done without pasting its gate output into `PROGRESS.md`.

## Repository layout

This directory is the **EdApex API service** — the backend for the frontend apps. It stays in this repository and is planned to become a package in a pnpm workspace; there is no separate repository and no extraction step.

- **No runtime import may resolve outside `apps/api/`.** Relative imports into `../src` are tolerated only while porting and must be gone by Phase 8.
- **All deployment config lives here:** `package.json`, lockfile, `wrangler.jsonc`, CI workflow. Nothing required to build or deploy may sit in the parent repo.
- **The spec suite stays in `../docs/cloudflare-port/`.** Do not fork it; one copy, verified from the repository root.
- **Source anchors stay relative** to `docs/cloudflare-port/`; the repository is not split, so they keep resolving.
- **Workspace wiring happens after Phase 9**, never during a migration or cutover window.

When the repository adopts a pnpm workspace, add `apps/api/` as a workspace package, keep its deployment scripts, and run the verifiers from the repository root. Do not move or fork the spec suite.

Clean-clone check:

1. Dependency scan shows zero imports into `../src` and zero workspace aliases pointing outside.
2. `pnpm install && pnpm exec vitest && pnpm exec wrangler deploy --dry-run` succeeds from a clean clone.
3. Both verifiers pass from the repository root.
4. Secrets are set with `wrangler secret put`; no `.dev.vars` is committed.

## Reporting

Every PR description and completion message uses:

```text
Phase: <n> — <name>
Status: done | partial | blocked
Changed: <one line>
Tests: <commands and result>
Gate: <pasted verifier / test output>
Deviations: <none, or what and why>
Open questions: <none, or the blocking question>
```

Ambiguity is a stop condition, not an invitation to guess.
