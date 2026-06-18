# Microtask mt-004 — fixtures.ts + types.ts

## Goal
Create typed builders for sandboxed fixture rows, plus shared type definitions used by all other helpers and tests.

## Scope (files to READ)
- `src/lib/server/db/sms-schema.ts` — ONLY for `$inferInsert` type extraction. Read just enough to identify the table→insert-type mapping for: sm_schools, sm_academic_years, sm_exam_types, sm_classes, sm_sections, sm_class_sections, sm_users, sm_staffs, sm_students, sm_student_records, sm_parents.

## Scope (NOT to read)
- Do NOT read any other source file
- Do NOT read any existing test file
- Do NOT read `student.repo.ts` or any other repo file

## Outputs (files to WRITE)
- `tests/lib/server/mastra/integration-helpers/types.ts`
- `tests/lib/server/mastra/integration-helpers/fixtures.ts`

## Constraints
- TypeScript strict: no `any`, no `as` casts (use `as const` only)
- All row types derived from `typeof sm_schools.$inferInsert` etc.
- `types.ts` exports:
  - `TenantFixtureIds` — interface for the sandbox ID bag
  - `SandboxedRow<T>` — generic `Omit<T, 'id'>` helper for builders
- `fixtures.ts` exports typed builders, each returning a `Omit<$inferInsert, 'id'>` shape:
  - `buildSchoolFixture(overrides?: Partial<...>): SchoolInsert`
  - `buildAcademicYearFixture(schoolId: number, overrides?): AcademicYearInsert`
  - `buildExamTypeFixture(schoolId: number, academicId: number, overrides?): ExamTypeInsert`
  - `buildClassFixture(schoolId: number, overrides?): ClassInsert`
  - `buildSectionFixture(schoolId: number, overrides?): SectionInsert`
  - `buildClassSectionFixture(schoolId: number, classId: number, sectionId: number, academicId: number, overrides?): ClassSectionInsert`
  - `buildUserFixture(overrides?): UserInsert`
  - `buildStaffFixture(schoolId: number, userId: number, overrides?): StaffInsert`
  - `buildStudentFixture(schoolId: number, classId: number, sectionId: number, userId: number, academicId: number, overrides?): StudentInsert`
  - `buildStudentRecordFixture(...): StudentRecordInsert`
  - `buildParentFixture(overrides?): ParentInsert`
- Builders return minimal required fields with sensible defaults; callers override via the optional parameter
- No actual DB insertion happens in this file — only typed row construction. The actual insertion is `withTenantFixture`'s job.

## Estimated LOC
~250 lines

## Definition of Done
- Files exist at `tests/lib/server/mastra/integration-helpers/types.ts` and `tests/lib/server/mastra/integration-helpers/fixtures.ts`
- Files pass `pnpm run check` with zero errors
- Files pass `pnpm run lint tests/lib/server/mastra/integration-helpers/{types,fixtures}.ts`
- Sanity test: in a scratch file, call each builder, confirm the return type matches the Drizzle `$inferInsert` for that table
- Write a one-page summary to `.planning/results/mt-004.md`