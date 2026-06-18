# Microtask mt-001 — withTenantFixture.ts

## Goal
Create the core integration-test fixture: a transactional fixture builder that constructs a real `ScopedRepositoryProvider` bound to a real `TenantContext`, inserts sandboxed fixture rows inside a transaction, runs the test callback, then rolls back. Also exposes a `mysql(sql, params)` helper for raw fact-check queries.

## Scope (files to READ)
- `src/lib/server/db/index.ts` (getDatabase, MySQLDrizzleClient, closeDatabase)
- `src/lib/server/mastra/scoped-repository.ts` (ScopedRepositoryProvider)
- `src/lib/server/mastra/tenant-context.ts` (TenantContext, createTenantContext)
- `src/lib/types/sms-types.ts` (ALLOWED_DESIGNATIONS)
- `vitest.config.ts`

## Scope (NOT to read)
- Do NOT read any other repository file (`student.repo.ts`, `result.repo.ts`, etc.)
- Do NOT read any tool, agent, workflow, or service file
- Do NOT read existing test files

## Outputs (files to WRITE)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`, no `unknown` without a type guard
- Use `import.meta.vitest` if needed; otherwise pure ESM
- ID generation: sandboxed integers in `[9_999_000, 9_999_999]` derived from `Date.now()` offset
- Real `getDatabase()` — NO mocks, NO stubs
- Each test runs inside `db.transaction(async (tx) => { ... })`; rollback on completion (no manual cleanup needed)
- Export two forms:
  1. `withTenantFixture(opts?): (fn: (fx: TenantFixture) => Promise<void>) => Promise<void>` — vitest-friendly wrapper
  2. `getTenantFixture(opts?): Promise<TenantFixture>` — direct usage for ad-hoc tests
- Export `TenantFixture` interface with: `db`, `provider`, `tenant`, `ids`, `mysql<T>(sql, params)`
- The `mysql` helper runs raw `mysql -h 127.0.0.1 -u devuser -p'paxxw0rd@2791' devdb -e "<sql>"` via `node:child_process.execFile`, parses tab-separated output, returns typed result
- For fixtures inserted, use the Drizzle `$inferInsert` types for type safety
- Fixture rows to insert: `sm_schools`, `sm_academic_years`, `sm_exam_types`, `sm_classes`, `sm_sections`, `sm_class_sections`, `sm_users`, `sm_staffs`, `sm_students`, `sm_student_records`, `sm_parents` (use minimal required fields only)
- All fixture inserts must happen INSIDE the transaction so rollback cleans them up
- Provider must be real `ScopedRepositoryProvider(db, tenant)` — not a stub
- `tenant` must be frozen via `Object.freeze(...)` or use `createTenantContext()` which freezes by default
- Default `tenant` if no opts: `schoolId: 9999001, classId: 9999003, sectionId: 9999004, examTypeId: 9999002, academicId: 9999005, staffId: 9999006, designationId: ALLOWED_DESIGNATIONS.IT`

## Estimated LOC
~280 lines

## Definition of Done
- File exists at `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- Sanity test: import the helper in a scratch file, call it once against real `devdb`, confirm transaction rolls back (verify with `mysql -e "SELECT COUNT(*) FROM sm_students WHERE id BETWEEN 9999000 AND 9999999"` after — must be 0)
- Write a one-page summary to `.planning/results/mt-001.md` covering: files written, LOC count, deviations