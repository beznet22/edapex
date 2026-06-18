# Microtask mt-008 — ResultsRepository integration test

## Goal
Write integration tests for `ResultsRepository` covering the methods called by tools/workflows: `batchUpsertMarkRecords`, `upsertClassAttendance`, `upsertTeacherRemark`, `upsertStudentRatings`, `getClassSectionById`, `getAssignedSubjects`, `createExamIfNotExist`, `upsertExamSetup`.

## Scope (files to READ)
- `src/lib/server/repository/result.repo.ts` (read this file carefully — focus on the public methods listed in the Goal)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- `src/lib/server/db/sms-schema.ts` — ONLY for tables relevant to result operations (sm_mark_stores, class_attendances, sm_teacher_remarks, sm_student_ratings, sm_class_sections, sm_assign_subjects, sm_subjects, sm_exams, sm_exam_setups)

## Scope (NOT to read)
- Do NOT read any other repository file
- Do NOT read any tool, agent, workflow, service, or other test file
- Do NOT modify any helper or src/ file

## Outputs (files to WRITE)
- `tests/lib/server/repository/result.integration.test.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`. Use `withTenantFixture`. No mocks.
- `describe.skipIf(!await canConnectDb())` at the top level
- Each test must use `withTenantFixture()` and the returned `fx`
- Test cases (minimum):
  1. **`batchUpsertMarkRecords` idempotency (critical)**: insert once → row exists; insert again with different score → same row, score updated (NOT duplicated). Use `fx.mysql<{c: string}>("SELECT COUNT(*) AS c FROM sm_mark_stores WHERE student_id=?", [...])` to verify single row.
  2. `batchUpsertMarkRecords` with multiple students → multiple rows
  3. `upsertClassAttendance({ classId, sectionId, academicId, examTypeId, present, absent })` creates/updates the attendance row
  4. `upsertTeacherRemark({ studentId, subjectId, examTypeId, remark })` inserts a remark keyed by `(studentId, subjectId, examTypeId)`
  5. `upsertStudentRatings({ studentId, examTypeId, ratings })` writes ratings
  6. `getClassSectionById(classId, sectionId)` returns the row joined with class name + section name
  7. `getClassSectionById` for a non-existent pair returns `null`
  8. `createExamIfNotExist` is idempotent: two calls with the same name → one row
  9. **Cross-tenant isolation**: results inserted under `schoolId=9999001` are NOT visible to a `schoolId=9999002` provider's queries
- Each test should include a `fx.mysql<T>()` fact-check where applicable

## Estimated LOC
~450 lines

## Definition of Done
- File exists at `tests/lib/server/repository/result.integration.test.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/repository/result.integration.test.ts`
- `pnpm test:integration tests/lib/server/repository/result.integration.test.ts` runs all tests green
- All sandboxed fixtures are cleaned up (verify with `mysql -e "SELECT COUNT(*) FROM sm_mark_stores WHERE school_id BETWEEN 9999000 AND 9999999"` — must be 0)
- Write a one-page summary to `.planning/results/mt-008-result-repo.md`