# mt-009 — mention-resolver integration test

## Summary

Wrote `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`
(300 LOC). Pins `resolveMentionsInMarkdown` against real devdb: seven
executable tests (one of which is `it.skip` with a comment explaining a
known bug) all pass when the database is reachable; when the DB is down,
the whole suite is `describe.skipIf`'d out by `canConnectDb()`.

## Files Written

| Path | LOC |
|------|-----|
| `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts` | 300 |
| **Total** | **300** |

## Test Cases

| # | Name | Status | Notes |
|---|------|--------|-------|
| 1 | resolves a single `{{students:<id>}}` mention against the tenant's school | pass | pre-seeded `sm_schools` (id `9998001`) + `sm_students` (id `9999007`, `fullName: "Alice Smith"`, `admission_no: 9999007`); tenant override pins `schoolId/studentId` to the pre-seeded IDs |
| 2 | resolves multiple mentions of different categories in one input | pass | same fixture; input mixes `students`, `date`, `custom` |
| 3 | resolves a `{{date:<iso>}}` mention as a literal pass-through | pass | no DB row needed |
| 4 | resolves a `{{custom:<text>}}` mention as a literal pass-through | pass | no DB row needed |
| 5 | rejects a student mention belonging to a different school with `WorkspaceMismatchError` | pass | pre-seeded `ROGUE_SCHOOL_ID=9998002` / `ROGUE_STUDENT_ID=9999008`; tenant is the primary one |
| 6 | rejects an unknown student id with `WorkspaceMismatchError` | pass | id `18000000` — no row exists anywhere |
| 7 | returns the input unchanged with empty mentions when no `requestContext` is provided | pass | pure early-return path, no DB |
| 8 | deduplicates identical mentions | `it.skip` | known inverted-dedup bug — see below |

Pass/fail summary: **7 passed, 1 skipped, 0 failed** when `canConnectDb()`
returns true (verified against the dev MySQL with the
`mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb` instance).

## Architectural note: why pre-seeded data is used instead of the fixture's `tx.insert`

`resolveMentionsInMarkdown` calls `getDatabase()` directly
(`src/lib/server/mastra/editor/mention-resolver.ts:54`), which is a
**pool-issued** Drizzle client. Each query checks out a fresh connection
from the 10-slot pool. The fixture's transaction holds a single
connection open for the test's lifetime, but that connection is just
*one* of the pool's ten — the resolver almost always picks a *different*
one. With the default REPEATABLE READ isolation, an in-progress
transaction's uncommitted writes are invisible to other connections in
the same pool, so a row inserted via the fixture's `fx.db` would not be
found by the resolver's lookup.

The cleanest way to make the resolver exercise a real DB path is to put
the data into a *committed* row before the test runs, then point the
fixture's `tenantOverrides` at it. `runMysql` (from
`integration-helpers/mysqlFactCheck.ts`) uses an out-of-process `mysql`
CLI invocation, so each statement is its own auto-commit session. Two
schools + two students are seeded in `beforeAll` and deleted in
`afterAll`. The fixture's own transaction is opened *after* the
pre-seeds are committed, so its snapshot is consistent with them; when
the fixture's `close()` rolls back its own seed (school at
`fx.ids.schoolId`, class, section, exam-type, …), the pre-seeded rows
are untouched and persist for the rest of the suite.

The IDs live below `9_999_000` (school) and in the sandboxed
`[9_999_000, 9_999_999]` range (student) so they cannot collide with
real production rows. `afterAll` removes them deterministically; a
post-run `SELECT COUNT(*) FROM sm_schools WHERE id IN (9998001,
9998002)` returns `0` and likewise for the students, confirming
zero-residue cleanup.

## Known bug: inverted dedup at `mention-resolver.ts:102-106`

**Code reference:** `src/lib/server/mastra/editor/mention-resolver.ts:102-106`:

```ts
const dedupeKey = `${category}:${rawId}`;
if (seen.has(dedupeKey)) {
    seen.add(dedupeKey);   // ← added only on the *skip* path
    continue;
}
// ... processing branch (no seen.add here) ...
```

**What the bug does.** The intent of the block is clearly to skip
duplicate mentions after the first occurrence (a typical
first-wins dedup). The actual implementation inverts the logic in two
ways:

1. `seen.add(dedupeKey)` is only called *inside* the
   `if (seen.has(dedupeKey))` branch — i.e., on the path that
   already has the key. Combined with…
2. the missing `seen.add(dedupeKey)` after the processing branch…
   …the result is that `seen` is never populated by successful
   lookups, `seen.has(dedupeKey)` is therefore always `false`, and
   **every** occurrence of a mention is processed. The dedup is
   effectively a no-op. The `mentions` array ends up with a
   duplicate entry for every repeated placeholder; the markdown
   output replaces every occurrence.

**Recommendation for the test pin.** The test case at index 8 in the
table above is `it.skip`'d with a multi-line comment that explains
the bug, the code reference, and the recommendation not to fix it as
part of this regression-pin task. The skip is appropriate because:

- The current code's *observable behaviour* for the spec's input
  (`"{{students:9999007}} {{students:9999007}}"`) is "both occurrences
  replaced" — which is *what a user would expect* but is *not what
  the variable name `seen` suggests*. Asserting "both occurrences
  replaced" would document the bug as intended behaviour and
  silently lock it in. That is the opposite of a regression net.
- When the bug is fixed, the test should be re-enabled and the
  expectation tightened to a single replacement + a
  single-`mentions` entry. Keeping the test as `it.skip` makes
  that future re-enable a one-line change rather than a rewrite.

The microtask spec explicitly told us to mark the dedup test
`it.skip` with a comment (DoD §4: "the dedup-bug test, which should
be marked `it.skip` with a comment explaining the known bug"), so the
test's `it.skip` form is also spec-compliant.

## Deviations from Spec

1. **`vi.mock("$env/dynamic/private", …)` and `vi.mock("$env/dynamic/public", …)` are
   present at the top of the file.** The integration config
   (`vitest.integration.config.ts`) does not load the SvelteKit Vite
   plugin, so `$env/dynamic/private` and `$env/dynamic/public`
   cannot be resolved at runtime. Every other integration test in
   `tests/lib/server/mastra/` (see `integration.test.ts`,
   `onboard-tools.test.ts`, `staff-tools.test.ts`, `bridge.test.ts`,
   …) carries the same two mocks — this is the project-wide
   convention, not a per-test choice. The mocks do not touch the
   system under test; they only rewire how `DATABASE_URL` (and
   friends) are read so the test can run in the integration
   config. The "no mocks" constraint in the spec clearly refers to
   not mocking the resolver or the fixture, both of which are used
   as-is. The mock factory prefers
   `process.env.DATABASE_URL` and falls back to the dev MySQL
   URL, so running the test through `pnpm test:integration` with
   the env var exported will use the real connection; running it
   with no env var still works against the dev instance.
2. **Pre-seeded rows are used instead of `fx.db.insert(...)`.**
   The `withTenantFixture` API is used (per spec), but the
   fixture's *transactional* `fx.db` cannot deliver data to the
   resolver's *pool-issued* connection. Pre-seeding two committed
   rows via `runMysql` in `beforeAll` (and cleaning up in
   `afterAll`) is the only way to exercise a real DB lookup
   without modifying `mention-resolver.ts` or the fixture. The
   spec's wording "use the real student fixture inserted by
   `withTenantFixture`" is followed for the *tenant context*
   (`fx.tenant` is still the source of truth for
   `RequestContext.set('tenantContext', …)`); only the *student
   data* is pre-seeded. The fixture's own transaction still
   rolls back on `close()`.
3. **`pnpm run lint` is not invoked.** `package.json` has no
   `lint` script and no ESLint/Prettier/Biome configuration, so
   the command does not exist. The microtask's DoD references
   `pnpm run lint path/to/file.ts`, but as documented in
   `.planning/results/mt-001.md` and `mt-004.md`, the project's
   verification command is `pnpm run check` (svelte-check). I
   ran `pnpm exec tsc --noEmit -p tsconfig.json` and confirmed
   zero diagnostics in the new file; the pre-existing
   `tsc` errors in `src/lib/components/ai-elements/...`,
   `src/lib/components/ui/...`, and
   `tests/lib/server/repository/base.integration.test.ts` (a
   pre-existing file from a future microtask) are not in
   scope and were not introduced by this change.
4. **No `vi.spyOn`, no `vi.fn`, no `vi.mock` for the system
   under test.** Only the two infrastructure mocks (env
   modules) above are present.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` → no diagnostics in
  `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`.
  (Pre-existing errors in unrelated files; not introduced here.)
- `pnpm run check` → same finding: no new errors or warnings in
  the new file.
- `DATABASE_URL=… pnpm test:integration tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`
  → **7 passed, 1 skipped, 0 failed** (538 ms).
- Post-run fact-check: `SELECT COUNT(*) FROM sm_schools WHERE id IN
  (9998001, 9998002)` and the matching `sm_students` query both
  return `0`, confirming `afterAll` cleanup ran cleanly.
- The full pre-existing unit-test suite (`pnpm test`) was not
  re-run; the new file is in the integration test path
  (`*.integration.test.ts`) and is not picked up by `vitest`
  without `--config vitest.integration.config.ts`.

## Status

Done. The seven executable tests pin the resolver's
`getDatabase()`-direct pattern as a regression net for the future
refactor to `ScopedRepositoryProvider`. The dedup test is left
`it.skip` with a comment that records the inverted-dedup bug at
`src/lib/server/mastra/editor/mention-resolver.ts:102-106`; the
fix is out of scope for this microtask and should be addressed
separately.
