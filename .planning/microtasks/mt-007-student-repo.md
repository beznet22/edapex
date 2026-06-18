# Microtask mt-007 — StudentRepository integration test

## Goal
Write integration tests for `StudentRepository` covering the methods called by tools: `getById`, `searchStudent`, `getStudentsByClassSection`, `assignClassSection`, `resolveGenderId`, `resolveStudentCategoryId`, `createStudent`.

## Scope (files to READ)
- `src/lib/server/repository/student.repo.ts` (read this file carefully — focus on the public methods listed in the Goal)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- `src/lib/server/db/sms-schema.ts` — ONLY for tables relevant to student operations (sm_students, sm_student_records, sm_users, sm_parents, sm_student_categories, sm_genders, sm_class_sections)

## Scope (NOT to read)
- Do NOT read any other repository file
- Do NOT read any tool, agent, workflow, service, or other test file
- Do NOT modify any helper or src/ file

## Outputs (files to WRITE)
- `tests/lib/server/repository/student.integration.test.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`. Use `withTenantFixture`. No mocks.
- `describe.skipIf(!await canConnectDb())` at the top level
- Each test must use `withTenantFixture()` and the returned `fx`
- Test cases (minimum):
  1. `getById(studentId)` returns the student joined with their `student_records` row
  2. `getById(nonExistentId)` returns `null` (not throws)
  3. `searchStudent(query, { classId, sectionId })` LIKE-matches against `fullName` and returns scoped results
  4. `getStudentsByClassSection({ classId, sectionId })` returns all students in that class+section
  5. `assignClassSection({ studentId, classId, sectionId })` updates the student's `student_records` row; calling twice is idempotent (one row, not two)
  6. `resolveGenderId("Female")` returns the `sm_genders.id` (lookup-or-create pattern)
  7. `resolveStudentCategoryId("Gen")` returns the `sm_student_categories.id` (lookup-or-create)
  8. **Cross-tenant isolation**: `getById` from tenant-A does NOT return students inserted by tenant-B even with the same numeric id (use two fixtures with different `schoolId`)
- Each test should include a `fx.mysql<T>()` fact-check where applicable
- Tests should be small — ~60 LOC per `it` block

## Estimated LOC
~400 lines

## Definition of Done
- File exists at `tests/lib/server/repository/student.integration.test.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/repository/student.integration.test.ts`
- `pnpm test:integration tests/lib/server/repository/student.integration.test.ts` runs all tests green
- All sandboxed fixtures are cleaned up (verify with `mysql -e "SELECT COUNT(*) FROM sm_students WHERE id BETWEEN 9999000 AND 9999999"` — must be 0)
- Write a one-page summary to `.planning/results/mt-007-student-repo.md`