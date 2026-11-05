# 01a — D1 Optimization Playbook

Binding rules for the EdApex → D1 port. Every optimization names the platform constraint it satisfies and the measurement that justifies it. If a rule is waived in a pull request, the waiver must cite the constraint it is trading away.

Sources: [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Drizzle batch API](https://orm.drizzle.team/docs/sqlite/batch-api), [D1 foreign keys](https://developers.cloudflare.com/d1/sql-api/foreign-keys/).

---

## 1. Tier-independent limits

These apply on every plan. They become design rules, not operational tuning.

| Constraint | Value | Consequence for this port |
|---|---|---|
| Bound parameters per query | **100** | Every list predicate and bulk insert must be chunked. `IN (...)` lists cap at ~95 ids once tenant filters are counted (O4). |
| Columns per table | **100** | `sm_general_settings` has **106** — it cannot be created as-is (O3). |
| SQL statement length | 100 KB | Bulk `VALUES` blocks must be split; chunking solves this automatically. |
| Row / value size | 2 MB | Photos, imports, and OCR payloads move to R2 (O17). |
| Query duration | 30 s | Large data migrations must be batched; a single `UPDATE` over hundreds of thousands of rows will fail. |
| Simultaneous connections per invocation | **6** | `Promise.all` over more than six queries must be queued (O13). |
| Query result size | 50 MB (effective 2026-11-04) | Exports must paginate; no unbounded result sets (O10). |
| Foreign keys | Always enforced | Deletes must be ordered. Table rebuilds fail when referenced; use `PRAGMA defer_foreign_keys` in migrations (O21). |
| Transactions | `BEGIN` rejected | `db.transaction()` does not work. `db.batch()` is the only atomic primitive (O5). |
| Batch accounting | `db.batch()` counts as **one** query | The main lever against the invocation budget. |

## 2. Tier-dependent limits

| Constraint | Free | Paid | Consequence |
|---|---|---|---|
| Queries per invocation | **50** | 1,000 | The binding runtime constraint. Design budget: **≤10 queries per endpoint** (O15). |
| Maximum database size | 500 MB | 10 GB | Ported subset is **74.0 MB** today; headroom exists but archival is planned (O18). |
| Storage per account | 5 GB | 1 TB | Caps the number of full tenant databases. |
| Databases per account | 10 | 1,000,000 | Rules out database-per-tenant on free. The single-database `school_id` model stays. |
| Time Travel | 7 days | 30 days | Recovery window for grades data. |
| Workers CPU per request | **10 ms** | 30 s default | Drives the hashing policy (§7) and forbids bcrypt. |
| Workers requests | 100k/day | unmetered | Development-only concern on free. |

### 2.1 Unresolved conflict — measure, do not guess

Two official sources disagree about the free-plan query ceiling:

- The D1 limits page states **50 queries per invocation (Free)**.
- The Feb-2026 Workers changelog states the free plan keeps 50 *external* subrequests but **1,000 subrequests to Cloudflare services** — and D1 is a Cloudflare service.

The difference is a 20× budget, so it is measured rather than assumed.

**Task (acceptance-gated):** in a staging Worker, issue 60 trivial `SELECT 1` queries inside one invocation; repeat with 1,001. Record the exact failure point from `wrangler dev` and from a free-plan deployment. Write the result into this document. **Until measured, every design targets 50.**

## 3. Measured baseline

Read-only introspection of the development database. Raw data: `.kimchi/docs/db-inventory.json`.

| Metric | Value |
|---|---|
| Ported tables | 62 (49 cataloged + 13 FK closure) |
| Secondary indexes on ported tables | **226** |
| Declared in the Drizzle schema | **4** |
| Missing from the schema | **222** |
| Tables with zero secondary indexes | `chat_group_users`, `exam_merit_positions`, `sm_schools` |
| Foreign keys in the database | 706 |
| Ported data size | 74.0 MB of 161.7 MB |
| Widest table | `sm_general_settings` — 106 columns |

Worst index gaps, by count:

| Table | Rows | Indexes in DB | Missing from schema |
|---|---|---|---|
| `sm_students` | 900 | 17 | 17 |
| `sm_mark_stores` | 119,484 | 9 | 9 |
| `sm_result_stores` | 30,775 | 9 | 9 |
| `sm_exam_schedules` | 859 | 9 | 9 |
| `sm_student_promotions` | 501 | 9 | 9 |
| `sm_class_routine_updates` | 0 | 8 | 8 |
| `sm_exam_setups` | 6,026 | 7 | 7 |
| `sm_fees_payments` | 0 | 7 | 7 |

**Interpretation:** 222 of 226 indexes exist only in the live MySQL database. Because `drizzle-kit` generates D1 migrations from the TypeScript schema, porting as-is would produce a D1 database with 4 indexes total. D1 bills rows read and rows written, so this is simultaneously a latency bug and a cost bug. Index recovery is the highest-leverage task in the entire port.

---

## 4. Optimization tiers

### Tier 1 — structural (complete before writing queries)

**O1 · Recover 222 indexes**
- *Constraint:* every scan is billed and counted.
- *Evidence:* §3.
- *Action:* for each of the 62 tables, translate the MySQL index definitions from `information_schema.STATISTICS` into Drizzle `index()` / `unique()` declarations. Keep index names so migration diffs stay readable.
- *Done when:* the generated D1 schema declares 226 secondary indexes and a migration test asserts the count per table.

**O2 · Lead composite indexes with `school_id`**
- *Constraint:* scan cost.
- *Evidence:* every hot predicate in the catalog starts `school_id` + `academic_id`, then class/section/student.
- *Action:* reorder recovered composites so the tenant column is first; a composite that starts with a non-tenant column cannot serve tenant-filtered reads.
- *Done when:* every composite index on a tenant-scoped table starts with `school_id`.

**O3 · Split `sm_general_settings` (106 → ≤100)**
- *Constraint:* 100-column cap.
- *Evidence:* measured 106.
- *Action:* §6.
- *Done when:* every D1 table has ≤100 columns, asserted by a schema test.

**O4 · Chunked bind helpers are the only list builder**
- *Constraint:* 100 bound parameters.
- *Evidence:* bulk paths already exist — `sm_mark_stores` carries 119,484 rows and mark upserts insert many rows per exam.
- *Action:* §5.
- *Done when:* `inArray` and multi-row `values()` are rejected in review; a lint rule or import boundary enforces the helpers.

**O5 · Batch-first writes with pre-generated ids**
- *Constraint:* no `BEGIN`; batch counts as one query.
- *Evidence:* 5 transaction sites exist (`student.repo.ts` ×2, `parent.repo.ts` ×1, `assessment.service.ts` ×2).
- *Action:* replace `db.transaction()` with `db.batch([...])`; generate UUIDs before building the batch, because a batch cannot read a generated id mid-flight.
- *Done when:* zero `db.transaction(` occurrences remain, and each former transaction has a written strategy.

### Tier 2 — query shape

**O6 · Eliminate N+1**
- *Constraint:* invocation query budget.
- *Evidence:* promotion, attendance import, and transcript assembly iterate per student.
- *Action:* collect ids, then one chunked `IN` query; write with one `chunkedInsert` inside a batch.
- *Done when:* no `await` inside a loop that issues a database call.

**O7 · Coalesce independent reads into one batch**
- *Constraint:* invocation query budget.
- *Evidence:* `loadConfigurations` issues 3 sequential selects ([base.repo.ts:118](../../src/lib/server/repository/base.repo.ts#L118)).
- *Action:* `db.batch([q1, q2, q3])` — one round trip, one counted query.
- *Done when:* request handlers issue no sequential independent reads.

**O8 · `onConflictDoUpdate` over delete+insert**
- *Constraint:* write cost.
- *Evidence:* `result.repo.ts` rewrites mark and result stores per subject ([result.repo.ts:265](../../src/lib/server/repository/result.repo.ts#L265)).
- *Action:* upsert on the natural key. Keep delete-then-insert only where removing stale children is the actual requirement (`cleanMarks`).
- *Done when:* each rewrite path documents why it is not an upsert.

**O9 · Never `SELECT *` on wide tables**
- *Constraint:* row size, serialization CPU, result size.
- *Evidence:* `sm_general_settings` 106 columns, `sm_staffs` 57, `sm_students` 55; `base.repo.ts` and `settings.service.ts` both use `select()` with no projection ([settings.service.ts:143](../../src/lib/server/service/settings.service.ts#L143)).
- *Action:* project only referenced columns.
- *Done when:* no `select()` without a projection against a table wider than 20 columns.

**O10 · Keyset pagination, not `OFFSET`**
- *Constraint:* rows read are billed; SQLite scans and discards on offset.
- *Evidence:* 50 MB result cap; large exports are planned.
- *Action:* paginate `WHERE id > :cursor ORDER BY id LIMIT :n`.
- *Done when:* no `OFFSET` appears in the ported repository layer.

**O11 · Index `chat_group_users`**
- *Constraint:* full scans on a hot join.
- *Evidence:* 10,740 rows with **zero** secondary indexes; it is written during class migration ([student.repo.ts:1102](../../src/lib/server/repository/student.repo.ts#L1102)).
- *Action:* add `(chat_group_id, user_id)` and `(user_id)`.
- *Done when:* the table appears in the index inventory with at least two keys.

### Tier 3 — runtime

**O12 · One `drizzle(env.DB)` per request**
- *Constraint:* Workers isolates; D1 pools server-side.
- *Evidence:* `src/lib/server/db/index.ts` keeps a module-global pool and cached promise.
- *Action:* construct the client in Hono middleware; no module-level state.
- *Done when:* no mutable module-level database singleton remains.

**O13 · Cap fan-out at 6**
- *Constraint:* six simultaneous connections per invocation.
- *Action:* queue beyond six, or fold into a batch.
- *Done when:* no `Promise.all` over more than six database calls.

**O14 · Two-layer caching**
- *Constraint:* invocation budget.
- *Evidence:* settings, academic years, and exam types are read on nearly every request.
- *Action:* keep the per-request config cache; add a short-TTL edge cache (Cache API) keyed `tenant:resource`.
- *Done when:* profile reads show one settings query per request at most.

**O15 · ≤10 queries per endpoint**
- *Constraint:* 50 (free) / 1,000 (paid) per invocation, unresolved (§2.1).
- *Action:* budget: auth 1–2, config 0–1 (cached), domain reads 3–5, writes batched.
- *Ownership:* the number is enforced at the service layer (`02-service-layer.spec.md`); repositories only report their own statement counts.
- *Done when:* each endpoint documents its query count and a test asserts it.

**O16 · Read replication (verify before use)**
- *Constraint:* latency and read throughput.
- *Action:* evaluate D1 read replication with session consistency for read-heavy parent views. Drizzle support must be confirmed against the D1 driver before designing around it.
- *Done when:* a decision is recorded either way.

### Tier 4 — data placement

**O17 · Blobs to R2**
- *Constraint:* 2 MB row cap; serialization CPU.
- *Evidence:* student photos, document uploads, OCR payloads.
- *Action:* store object keys; serve via signed URLs.
- *Done when:* no `TEXT` column stores binary or base64 payloads.

**O18 · Archive by academic year**
- *Constraint:* 500 MB free / 10 GB paid.
- *Evidence:* 74.0 MB ported today; `sm_mark_stores` alone is 43.2 MB and grows with students × subjects × exams.
- *Action:* define the archival boundary (closed academic years) and an export path. Decide the trigger from measured growth, not a guess.
- *Done when:* the threshold and procedure are written.

**O19 · Denormalize hot joins deliberately**
- *Constraint:* invocation budget.
- *Evidence:* precedent exists — `telegram_parent_link` denormalizes school contact data to avoid joins.
- *Action:* permit denormalization where a read path joins four or more tables, with a documented staleness policy.
- *Done when:* each denormalized column names its source and refresh trigger.

**O20 · One date representation**
- *Constraint:* index usability and correct ordering.
- *Evidence:* `auth.repo.ts` compares MySQL-formatted strings ([auth.repo.ts:59](../../src/lib/server/repository/auth.repo.ts#L59)).
- *Action:* choose integer unix seconds or ISO-8601 text, schema-wide. Never mix.
- *Done when:* a schema test rejects a second date encoding.

### Tier 5 — ops and verification

**O21 · Migrations with deferred FK checks**
- *Action:* `wrangler d1 migrations apply`; use `PRAGMA defer_foreign_keys = on` for rebuilds, and order deletes parent-last.
- *Done when:* a full migration runs from empty to seeded in CI.

**O22 · Idempotent reference seeding**
- *Action:* `INSERT OR IGNORE` for the 13 closure tables; they are seed-only.
- *Done when:* re-running the seed changes nothing.

**O23 · Test against real D1**
- *Action:* `@cloudflare/vitest-pool-workers`.
- *Evidence:* `BEGIN` rejection, bind limits, and FK enforcement do not reproduce on `node:sqlite`.
- *Done when:* the port's test suite runs in the Workers pool.

**O24 · Index-presence test**
- *Action:* assert per-table index counts against the recovered inventory.
- *Done when:* deleting an index declaration fails CI.

**O25 · Measure the query ceiling**
- *Action:* §2.1.

---

## 5. Chunk helper contracts

These are the only sanctioned ways to build lists. Both are pure functions; the caller owns batching.

```ts
/** D1 allows 100 bound parameters per statement. Reserve room for tenant filters. */
export const MAX_BINDS = 100;
export const IN_CHUNK = 95;   // 95 ids + up to 5 fixed predicates

export function chunkedInArray<T>(
  column: SQLiteColumn,
  ids: readonly T[]
): SQL[] {
  // returns one predicate per chunk; caller ANDs or ORs them
}

/**
 * Split rows so that paramsPerRow * rows <= MAX_BINDS.
 * Returns statements for db.batch(); never executes per-row inserts.
 */
export function chunkedInsert<TTable extends SQLiteTable>(
  table: TTable,
  rows: readonly InsertRow<TTable>[],
  paramsPerRow: number
): BatchItem[]
```

Rules:
- `chunkedInsert` must assert `paramsPerRow <= MAX_BINDS` and throw at build time, not at query time.
- An empty input returns an empty array — callers must not issue `IN ()`.
- Chunk size is derived, never hard-coded per call site.

## 6. `sm_general_settings` split

Measured: 106 columns, the only ported table over the 100-column cap.

Columns actually used by this codebase:

| Direction | Columns |
|---|---|
| Read by name | `id`, `school_id`, `academic_id`, `session_id`, `language_id`, `date_format_id`, `school_name`, `logo`, `identity` |
| Written | `school_name`, `phone`, `email`, `address`, plus `logo` on upload ([settings.service.ts:38](../../src/lib/server/service/settings.service.ts#L38)) |

Both `base.repo.ts` and `settings.service.ts` use `select()` without a projection, so other fields may be consumed indirectly. The split therefore **keeps all data** by moving the long tail out of the column budget:

```text
school_settings          id, school_id, academic_id, session_id, language_id,
                         date_format_id, school_name, phone, email, address,
                         logo, identity                                   (12 columns)

school_settings_extras   school_id  PK, payload TEXT (JSON)               (2 columns)
                         -- the remaining 94 legacy fields, verbatim
```

- `school_settings` carries the active surface and is what repositories read.
- `school_settings_extras` is written only by the legacy-parity path and is never joined in hot queries.
- If introspection during migration shows the 94 fields are unused, drop `school_settings_extras` entirely — the decision is data-driven, not assumed.

## 7. CPU and hashing budget

Measured locally (V8 + OpenSSL; Workers uses a different crypto build, so re-measure on `wrangler dev`):

| Operation | Cost |
|---|---|
| SHA-256 digest | **0.004 ms** |
| PBKDF2-SHA256, 10k iterations | **6.1 ms** |
| PBKDF2-SHA256, 50k iterations | 25.8 ms |
| PBKDF2-SHA256, 100k iterations | 51.9 ms |
| PBKDF2-SHA256, 210k iterations | 111.5 ms |
| bcrypt | not installed; WASM bcrypt is slower and cannot fit the budget |

Rules:

1. **No KDF on the login path.** The transitional credential is a published constant shared by all accounts; a KDF adds cost and no security (see `04a`).
2. **SHA-256 for tokens.** Magic links, student codes, and session tokens are 256-bit random; a fast hash is the correct primitive.
3. **No bcrypt anywhere.** No native implementation on Workers; no real passwords survive cutover.
4. **A KDF only returns if real passwords do** — and then the iteration count is chosen by benchmark against the CPU budget, never copied from a default.
5. **CI gate:** the complete claim flow (hash + session insert + cookie sign) must stay under **10 ms** locally, and the number is re-measured on `wrangler dev` before cutover.

## 8. Reproduction

```bash
node scripts/introspect-mysql.mjs     # refreshes .kimchi/docs/db-inventory.json
```

The script is read-only: `SELECT` and `SHOW` only, credentials from `.env`, never printed.

## 9. Acceptance checklist

- [ ] 222 recovered indexes declared; per-table counts asserted in a migration test (O1, O24)
- [ ] Every D1 table ≤100 columns (O3)
- [ ] Zero `db.transaction(` in the repository layer (O5)
- [ ] Zero raw `inArray` / multi-row `values()` outside the chunk helpers (O4)
- [ ] Zero `select()` without projection on tables >20 columns (O9)
- [ ] Zero `OFFSET` pagination (O10)
- [ ] `chat_group_users` indexed (O11)
- [ ] No module-level database singleton (O12)
- [ ] Every endpoint documents a query count ≤10 (O15)
- [ ] Claim flow benchmarked under 10 ms on `wrangler dev` (O25, §7)
- [ ] Query-ceiling measurement recorded (§2.1)
