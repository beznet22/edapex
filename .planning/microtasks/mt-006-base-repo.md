# Microtask mt-006 — BaseRepository integration test

## Goal
Write integration tests for `BaseRepository` covering `loadConfigurations`, `getActiveAcademicYear`, `getExamTypes`, `getAcademicId`, and the per-provider configuration cache.

## Scope (files to READ)
- `src/lib/server/repository/base.repo.ts` (read this file carefully — understand every public method)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts` (the fixture helper)
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts` (for raw assertions)
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts` (for the describe.skipIf guard)
- `src/lib/server/db/sms-schema.ts` — ONLY for the relevant tables: `sm_general_settings`, `sm_academic_years`, `sm_exam_types`

## Scope (NOT to read)
- Do NOT read any other repository file (student.repo.ts, result.repo.ts, etc.)
- Do NOT read any tool, agent, workflow, service, or other test file
- Do NOT modify `withTenantFixture.ts`, `mysqlFactCheck.ts`, `canConnectDb.ts`, or any file under `src/`

## Outputs (files to WRITE)
- `tests/lib/server/repository/base.integration.test.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`. Use the `withTenantFixture` helper; do NOT mock anything.
- Use `describe.skipIf(!await canConnectDb())` at the top level so tests skip gracefully when DB is unreachable
- Each test must call `withTenantFixture()` and use the returned `fx` to access `db`, `provider`, `tenant`, `ids`, `mysql`
- Test cases (minimum):
  1. `loadConfigurations()` returns `generalSettings`, `academicYears`, `examTypes`, `activeAcademicYear` for the tenant's schoolId
  2. `getActiveAcademicYear()` returns the academic year whose date range covers today (or `activeStatus=1` fallback)
  3. `getExamTypes()` returns only `activeStatus=1` exam types for the active academic year
  4. `getAcademicId()` returns the id of the active academic year
  5. **Cache test**: two consecutive `loadConfigurations()` calls within the TTL window should return the same `lastUpdated` (proves the per-provider cache works)
  6. **Cache invalidation test**: `loadConfigurations(true)` after a cached call should refresh the cache
  7. **Cross-tenant cache isolation test**: two providers with different `schoolId` should have isolated caches
- Each test should also have one fact-check via `fx.mysql<T>("SELECT ...", [...])` where applicable (e.g., verify `sm_academic_years` rows exist for the sandbox schoolId)
- Tests should be small and focused — no more than ~80 LOC per `it` block

## Estimated LOC
~350 lines

## Definition of Done
- File exists at `tests/lib/server/repository/base.integration.test.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/repository/base.integration.test.ts`
- `pnpm test:integration tests/lib/server/repository/base.integration.test.ts` runs all tests green
- All sandboxed fixtures are cleaned up (verify with `mysql -e "SELECT COUNT(*) FROM sm_schools WHERE id BETWEEN 9999000 AND 9999999"` — must be 0)
- Write a one-page summary to `.planning/results/mt-006-base-repo.md`