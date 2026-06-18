# Microtask mt-013 — fix G2 repo test files

## Goal
Fix the 3 broken repo integration test files (mt-006 base, mt-007 student, mt-008 result). The original subagents were cancelled mid-write and the test code has systematic bugs around FK relationships and fixture assumptions. Make all 3 files pass `pnpm test:integration`.

## Scope (files to READ)
- `tests/lib/server/repository/base.integration.test.ts` (current broken state)
- `tests/lib/server/repository/student.integration.test.ts` (current broken state)
- `tests/lib/server/repository/result.integration.test.ts` (current broken state)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts` (the fixture helper — DO NOT MODIFY)
- `src/lib/server/repository/base.repo.ts` (the BaseRepository methods under test)
- `src/lib/server/repository/student.repo.ts` (the StudentRepository methods under test)
- `src/lib/server/repository/result.repo.ts` (the ResultsRepository methods under test)
- `src/lib/server/db/sms-schema.ts` — ONLY for the table definitions needed

## Scope (NOT to read)
- Do NOT read any other source file
- Do NOT modify any helper or src/ file
- Do NOT modify `withTenantFixture.ts` — fix the TESTS, not the helper

## Outputs (files to WRITE)
- Rewrite `tests/lib/server/repository/base.integration.test.ts`
- Rewrite `tests/lib/server/repository/student.integration.test.ts`
- Rewrite `tests/lib/server/repository/result.integration.test.ts`
- Write `.planning/results/mt-013-fix-g2-repo-tests.md`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`
- Use `withTenantFixture` and `fx.mysql` for fact-checks
- `describe.skipIf(!await canConnectDb())` at the top
- **CRITICAL: When the test inserts auxiliary rows beyond the fixture's defaults (e.g., an extra academic year for isolation testing), it MUST first insert any required parent rows** (e.g., insert `sm_schools` row BEFORE inserting `sm_academic_years` row that references it). Otherwise FK constraints will fail.
- Tests should NOT use sandbox IDs that overlap with the fixture's IDs (e.g., `fx.ids.schoolId + 100` is fine, but verify it stays under 9_999_999)
- For tests using `markFixtureRecordDefault` or similar helpers — if the helper doesn't exist, inline the logic using `fx.db.update(studentRecords).set({...})`
- For `resolveGenderId` / `resolveStudentCategoryId` tests — these look up from `sm_base_setups` / `sm_student_categories` tables which the fixture doesn't insert. Either: (a) insert these rows in the test setup, OR (b) adjust the assertions to test only that the call doesn't throw and returns a defined value
- For the `batchUpsertMarkRecords` test, set `studentRecordId` to `fx.ids.recordId` (the fixture now explicitly inserts student_records with this id)
- For `assignClassSection` test, use `fx.ids.recordId` as the student record ID to update

## Known Bugs in Current Files

### base.integration.test.ts
- Line ~232-293: "two providers with different schoolId have isolated caches" inserts `sm_academic_years` with `school_id = isolatedSchoolId` but never creates `sm_schools` row for that ID. **Fix**: Either (a) also insert a `sm_schools` row with id=isolatedSchoolId before inserting academic_years, OR (b) delete this test — it's over-complex.
- Tests using `getActiveAcademicYear` previously failed because fixture used year 2099 — that's been fixed (fixture now uses 2020-01-01 to 2099-12-31 range).

### student.integration.test.ts
- All 7 tests fail with similar pattern. The tests use `fx.ids.recordId` correctly now (fixture was fixed to insert student_records with explicit id). But the tests may have other issues with `markFixtureRecordDefault` helper that's referenced but not imported.
- For `resolveGenderId` / `resolveStudentCategoryId` tests: these methods look up from `sm_base_setups` table which is empty. Fix by inserting a test setup row first or adjusting assertions.

### result.integration.test.ts
- `batchUpsertMarkRecords` fails with `student_record_id` FK violation. Now fixed by adding explicit `id` to student_records insert. Other tests may need similar treatment.

## Estimated LOC
~1200 lines (rewriting 3 files)

## Definition of Done
- All 3 test files rewritten, pass `pnpm test:integration tests/lib/server/repository/` (all tests green, no skips)
- No permanent DB pollution (verify `mysql -e "SELECT COUNT(*) FROM sm_students WHERE id BETWEEN 9999000 AND 9999999"` = 0 after)
- `pnpm run check` still passes with 0 errors
- All tests use real DB (no mocks except for LLM services)
- Each test has at least one `fx.mysql` fact-check
- Write summary to `.planning/results/mt-013-fix-g2-repo-tests.md`
- Append `{"id":"mt-013-fix-g2-repo-tests","status":"completed","ts":<ms>}` to `.planning/ledger.jsonl`