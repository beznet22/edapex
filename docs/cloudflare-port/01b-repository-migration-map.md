# 01b — Repository Migration Map

Every method in the current repository layer, with the module it moves to under the target architecture in [01](./01-repository-layer.spec.md) and a hazard flag for the D1 port.

**Generated** by `scripts/gen-migration-map.mjs`. Regenerate after changing the repository layer:

```bash
node scripts/gen-migration-map.mjs
```

## How to read it

- **Destination** — the target folder/file from [01 §3.1](./01-repository-layer.spec.md). Where a method belongs to a service rather than a repository, it says so explicitly.
- **Hazard** — advisory, not a verdict. Flags: `bulk` (loops or mass writes), `chunks-binds` (uses `inArray`, must go through `chunkedInArray`), `needs-batch` (upsert that should be one statement), `transaction` (uses `db.transaction`, must be rewritten), `read`/`write`, `review` (no confident default).
- **Line** — location in the current file, for traceability. It will drift as Stage 1 edits land.

## Summary

| Repository | Methods | Notes |
|---|---|---|
| `assignment.repo.ts` | 2 | |
| `auth.repo.ts` | 12 | |
| `base.repo.ts` | 9 | |
| `parent.repo.ts` | 6 | |
| `result.repo.ts` | 32 | |
| `school.repo.ts` | 1 | |
| `staff.repo.ts` | 12 | |
| `student.repo.ts` | 26 | |
| `timeline.repo.ts` | 8 | |
| **Total** | **108** | |

## Destination clusters

| Destination | Receives |
|---|---|
| `accounts/` | users, roles, sessions, credential claim |
| `profiles/student/` | profile, records, lifecycle primitives, search |
| `profiles/staff/`, `profiles/parent/` | staff and guardian profiles |
| `reference/` | dictionaries: base setups, designations, departments, categories, locales |
| `academics/` | classes, sections, subjects, assignments, class-sections, timetable |
| `assessments/` | exams, setups, marks, results, grades, merit, feedback, homework |
| `attendance/` | student and class attendance |
| `fees/` | groups, types, masters, assignments, payments |
| `school/` | school, settings, academic year, academic config cache |
| `communications/` | chat groups, calendar, notices |
| `base/` | context, error handling, D1 helpers, filters, pagination |

## Cross-concern moves worth reviewing

| Current location | Move | Why |
|---|---|---|
| `result.repo.ts` `upsertClassAttendance` | `attendance/class-attendance` | Attendance is not an assessment concern |
| `result.repo.ts` `assignSubjects`, `getAssignedSubjects` | `academics/assignment` | Subject assignment belongs with academics |
| `result.repo.ts` `getStudentCategories` | `reference/student-category` | Duplicated dictionary lookup |
| `student.repo.ts` `promoteStudent`, `demoteStudent` | `student-lifecycle.service` | Orchestration plus chat-group cleanup |
| `base.repo.ts` config and term methods | `school/academic-config`, `assessments/exam` | Domain logic out of the base class |

## Methods

### `assignment.repo.ts` — 2 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `assignClassTeacher` | 6 | academics/assignment | bulk |
| `assignSubjectTeacher` | 93 | academics/assignment | bulk |

### `auth.repo.ts` — 12 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `findUser` | 13 | accounts/auth | read |
| `findStaff` | 26 | accounts/auth | read |
| `createSession` | 34 | accounts/auth | write |
| `validateSession` | 46 | accounts/auth | review |
| `deleteSession` | 80 | accounts/auth | write |
| `deleteAllUserSessions` | 87 | accounts/auth | write |
| `createRefreshToken` | 94 | accounts/auth | write |
| `validateRefreshToken` | 114 | accounts/auth | review |
| `revokeRefreshToken` | 130 | accounts/auth | review |
| `updateUserPassword` | 137 | accounts/auth | write |
| `createUser` | 144 | accounts/user | write |
| `updateUser` | 152 | accounts/auth | write |

### `base.repo.ts` — 9 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `loadConfigurations` | 100 | school/academic-config | review |
| `getGeneralSettings` | 136 | school/settings | write |
| `getGeneralSettingBySchoolId` | 144 | school/settings | write |
| `getAcademicYears` | 152 | school/academic-year | read |
| `getActiveAcademicYear` | 160 | school/academic-year | read |
| `getAcademicYearById` | 168 | school/academic-year | read |
| `getAcademicId` | 176 | school/academic-year | read |
| `getExamTypes` | 187 | assessments/exam | read |
| `getCurrentTerm` | 202 | assessments/exam | read |

### `parent.repo.ts` — 6 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `findParentByEmail` | 14 | profiles/parent/profile | read |
| `findParentByStudentId` | 28 | profiles/parent/profile | read |
| `findParentByAdmissionNo` | 44 | profiles/parent/profile | read |
| `searchParentsByStudentName` | 60 | profiles/parent/profile | read |
| `searchParentsByName` | 76 | profiles/parent/profile | read |
| `updateParentEmail` | 100 | profiles/parent/profile | transaction |

### `result.repo.ts` — 32 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `assignSubjects` | 29 | academics/assignment | bulk |
| `getClassSectionById` | 63 | academics/class-section | read |
| `getAssignedSubjects` | 91 | academics/assignment | bulk |
| `getAssignedClassSection` | 130 | academics/assignment | bulk |
| `upsertClassAttendance` | 168 | attendance/class-attendance | needs-batch |
| `getStudentRatings` | 204 | assessments/feedback | read |
| `getTeacherRemarks` | 230 | assessments/feedback | read |
| `deleteResultStore` | 253 | assessments/results | write |
| `deleteMarkStore` | 263 | assessments/results | chunks-binds |
| `cleanMarks` | 273 | assessments/results | bulk, chunks-binds |
| `deleteExamSetup` | 363 | assessments/results | chunks-binds |
| `queryResultData` | 369 | assessments/results | read |
| `getClassAverages` | 458 | assessments/results | write |
| `getTranscriptData` | 479 | assessments/results | chunks-binds |
| `getMarksData` | 579 | assessments/results | read |
| `getObjectives` | 618 | assessments/feedback | read |
| `upsertDaycareLearningOutcome` | 623 | assessments/feedback | needs-batch |
| `upsertStudentRatings` | 657 | assessments/feedback | needs-batch |
| `upsertTeacherRemark` | 677 | assessments/feedback | needs-batch |
| `updateExamSetup` | 690 | assessments/exam-setup | write |
| `upsertExamSetup` | 716 | assessments/exam-setup | needs-batch |
| `batchUpsertMarkRecords` | 743 | assessments/results | bulk, needs-batch |
| `batchUpsertResultRecords` | 761 | assessments/results | bulk, needs-batch |
| `createExamIfNotExist` | 779 | assessments/exam | write |
| `getAssignedTeacher` | 803 | academics/assignment | bulk |
| `getExamSetupsByStaffId` | 820 | assessments/exam-setup | write |
| `getExamSetupsByClassSection` | 840 | assessments/exam-setup | write |
| `getExamSetup` | 864 | assessments/exam-setup | write |
| `getSubjectFullMark` | 887 | assessments/exam-setup | read |
| `getMarkGrade` | 907 | assessments/results | read |
| `getStudentCategories` | 925 | reference/student-category | read |
| `getSubjectsByClass` | 934 | academics/subject | read |

### `school.repo.ts` — 1 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `getSchoolInfo` | 12 | school/school | read |

### `staff.repo.ts` — 12 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `getById` | 60 | profiles/staff/profile | read |
| `getStaffRegistrationOptions` | 72 | profiles/staff/profile | read |
| `createStaff` | 103 | profiles/staff/profile | write |
| `updateStaff` | 169 | profiles/staff/profile | write |
| `updateStaffPhoto` | 217 | profiles/staff/profile | write |
| `resolveDesignationId` | 225 | profiles/staff/profile | review |
| `resolveDepartmentId` | 243 | profiles/staff/profile | review |
| `getStaffByEmail` | 260 | profiles/staff/profile | read |
| `searchStaff` | 270 | profiles/staff/profile | read |
| `updateStaffStatus` | 305 | profiles/staff/profile | write |
| `deleteStaff` | 341 | profiles/staff/profile | write |
| `getStaffByClassSection` | 374 | profiles/staff/profile | read |

### `student.repo.ts` — 26 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `createStudentIfNotExists` | 103 | profiles/student/profile | write |
| `getStudentBySiblings` | 334 | profiles/student/search | read |
| `getStudentsByClassSection` | 352 | profiles/student/search | read |
| `getStudentsByStaffId` | 388 | profiles/student/search | read |
| `createIfNotExistsStudentRecord` | 437 | profiles/student/records | write |
| `getStudentRecord` | 474 | profiles/student/records | read |
| `getStudentRecordByAdmissionNo` | 506 | profiles/student/records | read |
| `updateStudent` | 537 | profiles/student/profile | write |
| `updateStudentPhoto` | 560 | profiles/student/profile | write |
| `updateStudentCategoryId` | 568 | profiles/student/profile | write |
| `getStudentById` | 577 | profiles/student/profile | read |
| `getById` | 633 | profiles/student/profile | read |
| `getRawStudentById` | 641 | profiles/student/profile | read |
| `getLatestPromotion` | 654 | profiles/student/lifecycle | bulk |
| `demoteStudent` | 669 | service: student-lifecycle (repo keeps primitives) | bulk, transaction |
| `resolveGenderId` | 746 | reference/base-setup | review |
| `resolveStudentCategoryId` | 766 | reference/student-category | review |
| `getRollNoAndAdmissionNo` | 779 | profiles/student/profile | read |
| `getStudentRegistrationOptions` | 805 | profiles/student/profile | read |
| `getClassAndSectionByName` | 858 | academics/class-section | read |
| `searchClassSection` | 889 | academics/class-section | read |
| `assignClassSection` | 929 | academics/class-section | bulk |
| `promoteStudent` | 977 | service: student-lifecycle (repo keeps primitives) | bulk, transaction, chunks-binds |
| `searchStudent` | 1176 | profiles/student/search | read |
| `updateStudentStatus` | 1209 | profiles/student/profile | write |
| `deleteStudent` | 1243 | profiles/student/profile | write |

### `timeline.repo.ts` — 8 methods

| Method | Line | Destination | Hazard |
|---|---|---|---|
| `createTimeline` | 12 | profiles/student/timeline | write |
| `createTimelineIfNotExist` | 19 | profiles/student/timeline | write |
| `getTimelinesByStudentId` | 40 | profiles/student/timeline | read |
| `getTimelineById` | 52 | profiles/student/timeline | read |
| `updateTimeline` | 63 | profiles/student/timeline | write |
| `deleteTimeline` | 69 | profiles/student/timeline | write |
| `upsertTimelines` | 79 | profiles/student/timeline | needs-batch |
| `getTimelinesByExam` | 92 | profiles/student/timeline | read |
