# Roadmap and coding-agent instructions

Implementation order for the EdApex port. Every phase has an executable brief a coding agent can follow without reading the whole conversation that produced these specs.

Read [README.md](./README.md) first, then the specs named in the phase you are working on. Progress lives in [PROGRESS.md](./PROGRESS.md); port code lands in [`apps/api/`](../../apps/api/AGENTS.md).

---

## Part 1 — Instructions for every coding agent

### 1.1 Authority order

When documents disagree, the higher entry wins:

1. [`schema-catalog.md`](./schema-catalog.md) — which **legacy** tables exist.
2. [`05-d1-migration.spec.md`](./05-d1-migration.spec.md) — how data moves.
3. [`01`](./01-repository-layer.spec.md) / [`02`](./02-service-layer.spec.md) / [`03`](./03-http-layer.spec.md) — structure and contracts.
4. [`04`](./04-auth-identity.spec.md) / [`04a`](./04a-auth-cutover.spec.md) / [`06`](./06-archive-and-retrieval.spec.md) — subsystem behaviour.
5. This roadmap — sequencing only; it never overrides a spec.

If two specs conflict, **stop and report**. Do not pick one silently.

### 1.2 Non-negotiables

- **62 legacy tables only** are migrated from MySQL. New tables are allowed only when a spec owns them (`04`, `05`, `06`) and never import MySQL data.
- **No `any`**, no `as any`; explicit return types; types inferred from Drizzle/Zod.
- **No `db.transaction()`** — `db.batch` only. No raw `inArray` or multi-row `values()` outside `chunkedInArray` / `chunkedInsert`.
- **Tenant scoping**: every query carries `school_id` from the request context; there is no fallback tenant.
- **Line caps**: repository 300, service 400, route module 300, domain ~200.
- **Error ownership**: repositories raise `Db*`; services raise domain errors; HTTP maps once into `{ error, message, requestId }`.
- **No secrets or dumps in git.** `edapexdb.sql` and `.env*` stay ignored.

### 1.3 Working agreement

1. One phase per branch and pull request. Do not start a phase until the previous phase's gate passes.
2. **Update [`PROGRESS.md`](./PROGRESS.md) when you start and when you finish a phase** — status row, gate checkboxes, change-log line. A phase is not done until that file reflects it.
3. Read the phase's "Read first" list completely before writing code.
4. If the spec is ambiguous or a required decision is missing, **stop and ask**; do not guess, and do not invent schema.
5. Keep diffs inside the phase. No drive-by refactors.
6. Regenerate artifacts after schema or route changes: `01b`, `03b`, migration order, integrity report. Commit the regenerated files.
7. Before opening a PR, run the verifiers and paste their output in the description:

   ```bash
   node scripts/verify-port-specs.mjs
   node scripts/verify-schema-catalog.mjs
   ```

8. Report back in this shape: **what changed · files · tests run · gate output · deviations · open questions**. Progress updates go to `PROGRESS.md`, not into the PR description alone.

---

## Part 2 — Phases

### Phase 0 — Scaffolding and guards

**Goal:** a deployable Worker skeleton with CI gates, before any domain code.

**Read first:** [03 §2–3](./03-http-layer.spec.md), [01a §2](./01a-d1-optimization.playbook.md).

**Do:**

- Create the Hono app entry (`src/worker.ts`) and `src/lib/server/http/app.ts` with only `/health`.
- Configure `wrangler.jsonc`: `d1_databases` binding `DB`, `nodejs_compat`, explicit `compatibility_date`.
- Add the test harness (`@cloudflare/vitest-plugin`) and a CI job running typecheck, tests, and both verifier scripts.
- Add import-boundary scaffolding (a lint rule or test) that will later ban `repository`/`db` imports inside route handlers.

**Do not:** implement routes, repositories, or schema beyond a placeholder.

**Gate:** `wrangler dev` serves `/health`; CI is green; the verifiers run in CI.

---

### Phase 1 — D1 schema and migrations

**Goal:** the complete target schema, created from migrations, with indexes recovered.

**Read first:** [05 §2–5](./05-d1-migration.spec.md), [01a §3–4](./01a-d1-optimization.playbook.md), [04 §2](./04-auth-identity.spec.md), [06 §3](./06-archive-and-retrieval.spec.md).

**Do:**

- Translate the 62 legacy tables using [05 §4](./05-d1-migration.spec.md) transforms: `academic_id` canonical, `session_id` dropped, booleans/timestamps/dates/decimals as specified, `sm_general_settings` split, `chat_groups` primary key.
- Create the redesigned tables: `academic_years` additions, `classes` ladder columns, `students` current record/status, `student_records` status chain, terms columns, plus `auth_*`, `promotion_*`, `archive_objects`, `session_jobs`, `session_result_summary`, `migration_resolutions`.
- Recover the **222 indexes** from `docs/cloudflare-port/audit/db-inventory.json`; lead composites with `school_id`.
- Generate migrations with drizzle-kit and apply locally with `wrangler d1 migrations apply --local`.

**Do not:** load any data; do not create the 253 non-ported tables.

**Gate:** a schema test asserts 62 legacy tables + the registered new tables, every table ≤100 columns, 226 secondary indexes, and `PRAGMA foreign_key_check` returning zero rows.

---

### Phase 2 — Repository layer

**Goal:** the repository tree from `01`, method-for-method against `01b`.

**Read first:** [01](./01-repository-layer.spec.md), [01b](./01b-repository-migration-map.md), [01a §4](./01a-d1-optimization.playbook.md).

**Do:**

- Build `base/` (`RepositoryContext`, `withErrorHandling`, `chunkedInArray`, `chunkedInsert`, `batchOrThrow`, filters, pagination).
- Implement the aggregate folders; move each method to its `01b` destination; delete the seven passthroughs and the retired auth methods.
- Keep placement authority in `student_records`, not `sm_students.class_id`.
- Write parity tests per repository and a tenant-isolation test for every public read.

**Do not:** add caching, orchestration, or cross-aggregate imports; do not keep `BaseRepository` domain methods.

**Gate:** `01b` destinations all implemented; no `db.transaction(`; no `any`; no file over its cap; tenant-isolation suite green.

---

### Phase 3 — Service layer

**Goal:** the five catalog-facing services with ports and adapters.

**Read first:** [02](./02-service-layer.spec.md), [04a §7](./04a-auth-cutover.spec.md).

**Do:**

- Build `context/`, `ports/`, `adapters/`, `domain/` per the tree.
- Implement entry/query/publish/feedback/ocr, attendance, settings (general/academic/report), auth (auth/session/profile/rate-limit), authorization.
- Replace the filesystem report-settings store with the D1 adapter **and** run the one-time import of `data/report-settings/*.json`.
- Move brute-force state to `auth_rate_limits`; remove the 1 s sleep; remove `bcrypt-ts` from the request path.

**Do not:** import `getDatabase`, `fs`, or another service class; do not port push notifications or the four app-db services.

**Gate:** 53 methods mapped; boundary test green; no module-scope `Map`/`Set`; report-settings import verified by count.

---

### Phase 4 — HTTP layer

**Goal:** the versioned Hono API with the exact contracts.

**Read first:** [03](./03-http-layer.spec.md), [03b](./03b-endpoint-map.md).

**Do:**

- Middleware order exactly as specified; flat error envelope; 422 `TENANT_SCOPE_REQUIRED` preserved byte-compatible.
- Implement the 20 in-scope endpoints; retire the demo endpoints; keep the public router outside auth.
- Method-chain routes and export `AppType`; add the `hc<AppType>` client.
- Add contract tests for every status, a type test for route coverage, and CORS/preflight tests.

**Do not:** put SQL or business rules in handlers; expose `{ success }` wrappers.

**Gate:** contract, type, boundary and CORS tests green; `TENANT_SCOPE_REQUIRED` body identical to the legacy contract.

---

### Phase 5 — Auth cutover flow

**Goal:** the transitional claim flow that lets 1,610 accounts move to passwordless.

**Read first:** [04a](./04a-auth-cutover.spec.md), [04](./04-auth-identity.spec.md).

**Do:**

- Implement `/claim`, Google linking, session issuance, rate limiting.
- Implement the one-time shared-digest reset (0.004 ms verification, no KDF).
- Student code issuance/reissue/revocation with hashed storage.
- Admin duplicate-email utility with linkage-derived personas and merge/flag actions.
- Emit `auth_events` for every attempt, success, failure, link, merge.

**Do not:** activate the route in production before Phase 8; do not store base64 images in session data.

**Gate:** end-to-end claim on local D1; duplicate email returns `409 AMBIGUOUS_EMAIL`; code reissue revokes sessions; claim flow measured under 10 ms on `wrangler dev`.

---

### Phase 6 — Archive and retrieval

**Goal:** session archiving, marksheet/transcript retrieval, and controlled deletion.

**Read first:** [06](./06-archive-and-retrieval.spec.md).

**Do:**

- Implement the per-student-session archive object with `schemaVersion`, `placement`, `terms`, marksheets, transcript.
- Implement `archive_objects`, `session_result_summary`, resumable `session_jobs`.
- Implement retrieval: live/archived marksheet, per-session and cross-session transcripts, PDFs, public token route.
- Implement versioning: draft → reviewed → published → superseded; grade override with audit.
- Implement archive/restore/purge with dual-admin wipe and `dryRun`.

**Do not:** recompute historical class averages; store base64 in objects; allow restore to accept writes.

**Gate:** archive/restore round-trip on a fixture; checksum mismatch quarantines; published version immutable; wipe blocked without the second admin token.

---

### Phase 7 — Migration execution

**Goal:** move the remote snapshot into D1 and create 2026/27.

**Read first:** [05](./05-d1-migration.spec.md), [docs/cloudflare-port/audit/integrity-report.md](./audit/integrity-report.md), [docs/cloudflare-port/audit/migration-order.md](./audit/migration-order.md).

**Do:**

- Build the transform: `academic_id` reconciliation, placement backfill, parents dedupe/create/delete, default-record normalisation, categories, settings split, password reset.
- Enforce the integrity gate; every fix writes `migration_resolutions`.
- Load tier by tier with `PRAGMA defer_foreign_keys`, id preservation, `sqlite_sequence` fix-up.
- Call bootstrap with the FIRST TERM dated 2026-09-14 → 2026-12-11; then the terms endpoint as calendars arrive.
- Run promotion class by class; generate the quarantine report (219 + 3).
- Rehearse twice on a scratch D1 before touching production.

**Do not:** migrate from the live remote; invent term dates; promote a student without a current record.

**Gate:** row-count and checksum reconciliation; gate zero; 681 current records (654 promoted + 24 DAYCARE + 3 quarantined); 463 subject assignments; 7 grade bands; readiness test passes.

---

### Phase 8 — Cutover

**Goal:** switch traffic with a rehearsed rollback.

**Do:**

- Freeze writes; run the final delta; repeat verification.
- Enable `/claim`; switch DNS/routes; monitor claim metrics, 5xx rate, and query budget for 24 h.
- Keep MySQL authoritative and read-only until the rollback window closes.

**Rollback trigger:** any FK violation, unexplained count variance above 0.1%, or result totals differing from the spot-check set. Rollback = revert routing; MySQL is still current.

**Gate:** checklist complete; rollback drilled; on-call briefed.

---

### Phase 9 — Post-cutover

**Goal:** retire the transitional surface and finish the target auth.

**Read first:** [04a §8](./04a-auth-cutover.spec.md), [04](./04-auth-identity.spec.md), [06 §7](./06-archive-and-retrieval.spec.md).

**Do:**

- Activate magic link and Google for parents/staff; retire `/claim` on the announced date.
- Null remaining password digests; drop the column in a later migration.
- Schedule the retention sweep; run it in `dryRun` first.
- Confirm archive manifests for sessions 1–4; purge only by decision.

**Gate:** all `04a` exit criteria met; claim route removed; retention sweep dry-run reports expected counts.

---

## Part 3 — Phase dependency map

```text
P0 → P1 → P2 → P3 → P4 → P5 → P6 → P7 → P8 → P9
                    ↘ P4 also unblocks P7's API-driven steps
```

P7 cannot start until P6 exists, because archiving history is part of the migration, and P4/P5 exist, because bootstrap and promotion are API operations.

## Part 4 — Definition of done (every phase)

- [ ] Typecheck, lint and tests pass.
- [ ] Both verifier scripts pass.
- [ ] No new `any`, no `db.transaction`, no direct DB access outside repositories.
- [ ] Generated artifacts regenerated and committed.
- [ ] **`PROGRESS.md` updated**: status row, gate checkboxes, change-log entry.
- [ ] PR description contains the phase gate output and the report format from §1.3.

## Part 5 — Repository layout

`apps/api/` is the **EdApex API service** — a deployable, UI-less backend consumed by the frontend apps. It stays in this repository and is planned to become a package in a pnpm workspace; there is no separate repository and no extraction step. `apps/` is the deployable bucket, not a frontend-only bucket. The rules below keep the package deployable on its own and the spec suite single-sourced.

| Rule | Why | Enforced by |
|---|---|---|
| Deployment config lives in `apps/api/` (`package.json`, lockfile, `wrangler.jsonc`) | the package must build and deploy without depending on the parent app | clean-clone `pnpm install && pnpm exec vitest && pnpm exec wrangler deploy --dry-run` |
| Runtime code does not import the legacy `src/` tree | the port is a rewrite, not a shared-code refactor; imports into `../src` would couple the Worker to SvelteKit | dependency scan in CI |
| The spec suite stays in `docs/cloudflare-port/`, one copy | two copies drift immediately | both verifier scripts |
| Workspace wiring happens after Phase 9 | migrating and reorganising the build simultaneously is unrecoverable | this roadmap's phase order |
| Source anchors remain relative to `docs/cloudflare-port/` | the repository is not split, so `../../src/...` links keep resolving | link check in `verify-port-specs.mjs` |

When the repository adopts a pnpm workspace, add `apps/api/` as a workspace package, keep its deployment scripts, and run the verifiers from the repository root. Do not fork the spec suite or move it under `apps/api/`.
