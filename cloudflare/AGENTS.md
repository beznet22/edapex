# AGENTS.md — Cloudflare port workspace

This directory is where the Hono + Cloudflare Workers + D1 application lands. **All port code goes here.** The legacy SvelteKit application stays in `src/` and is not moved.

## Read before coding

1. [`../docs/cloudflare-port/ROADMAP.md`](../docs/cloudflare-port/ROADMAP.md) — phase order, gates, working agreement.
2. [`../docs/cloudflare-port/PROGRESS.md`](../docs/cloudflare-port/PROGRESS.md) — current phase and status. **Update it in the same PR.**
3. The specs for the phase you are on, in the order the roadmap lists them.

Authority: the catalog wins for legacy tables, `05` wins for migration, the layer specs win for structure, the roadmap wins only for sequencing. If two documents conflict, stop and report.

## Expected layout

```text
cloudflare/
  wrangler.jsonc            # D1 binding, nodejs_compat, compatibility_date
  src/worker.ts             # export default app
  src/lib/server/http/      # app.ts, middleware/, routes/, schemas/, dto/
  src/lib/server/repository/ # base/, accounts/, profiles/, academics/, assessments/, ...
  src/lib/server/services/  # context/, ports/, adapters/, domain/, assessment/, auth/, ...
  src/lib/server/db/        # schema, migrations, seed
  src/lib/http/client.ts    # hc<AppType>
  tests/                    # vitest-pool-workers
```

`src/lib/...` inside `cloudflare/` is intentional: it keeps the aliases identical to the legacy tree so the repository map (`01b`) transfers without rewriting imports.

## Commands

Run from `cloudflare/`:

```bash
pnpm install
pnpm exec wrangler dev                       # local Worker + local D1
pnpm exec wrangler d1 migrations apply DB --local
pnpm exec vitest                             # @cloudflare/vitest-pool-workers
pnpm exec tsc --noEmit
```

From the repository root, before any PR:

```bash
node scripts/verify-port-specs.mjs
node scripts/verify-schema-catalog.mjs
```

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

## Future extraction

This directory is the **new EdApex API backend** and is planned to become its **own repository** after cutover. Keep it extractable at all times:

- **No runtime import may resolve outside `cloudflare/`.** Relative imports into `../src` are tolerated only while porting and must be gone by Phase 8.
- **All deployment config lives here:** `package.json`, lockfile, `wrangler.jsonc`, CI workflow. Nothing required to build or deploy may sit in the parent repo.
- **The spec suite moves with this directory before extraction.** Do not fork it; one copy, moved once.
- **Source anchors will not survive the move.** The specs link to the legacy tree with relative paths; those break in a new repository. Before extraction, convert them to permalinks at a frozen legacy commit (or drop them deliberately and record the removal).
- **Extraction happens after Phase 9**, never during a migration or cutover window.

Extraction checklist:

1. Dependency scan shows zero imports into `../src` and zero workspace aliases pointing outside.
2. `pnpm install && pnpm exec vitest && pnpm exec wrangler deploy --dry-run` succeeds from a clean clone.
3. `docs/cloudflare-port/` moved in, links rewritten, both verifiers green in the new repo.
4. Secrets recreated with `wrangler secret put`; no `.dev.vars` copied.
5. Legacy repository archived or set read-only.

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
