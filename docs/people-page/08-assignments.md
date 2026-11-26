# 08 — Assignments & Self-Assignment

Legacy addition. No new table/column. Bootstrap: [09-unassigned-bootstrap.md](09-unassigned-bootstrap.md).
Performance/repository rules: [10-performance-repositories.md](10-performance-repositories.md).

## Data model

| Concept | Representation |
| --- | --- |
| Offering | `sm_assign_subjects` with `teacher_id = NULL`, `active_status = 1` |
| Assignment | same row with `teacher_id` set |
| Deactivated | `active_status <> 1` |
| Catalog | active `sm_subjects` for school/year |
| Toggle | `sm_general_settings.auto_approve`: `1` enabled, `0` disabled |

**Invariant:** at most one active teacher per
`(school_id, academic_id, class_id, section_id, subject_id)`. Application-level only.

**Live:** 463 rows, 0 unassigned, 48 duplicate groups, 46 teachers, 52 class-sections,
`auto_approve=0`.

## Repository placement

All data access in `AssignmentRepository`/`SettingsService`; no
`assignment-queries.ts`/`assignment-mutations.ts`.

| Need | Method |
| --- | --- |
| Toggle read | `SettingsService.getTeacherSelfAssignEnabled` (reuses general settings) |
| Toggle write | `SettingsService.setTeacherSelfAssignEnabled` |
| Subjects | `AssignmentRepository.listSubjectOptions` |
| Offerings | `AssignmentRepository.listOfferings` (class-scoped) |
| Conflicts | `AssignmentRepository.listConflicts` |
| Eligibility | `AssignmentRepository.getEligibility` |
| Create | `AssignmentRepository.createOfferings` (batch) |
| Assign | `AssignmentRepository.assignOfferingTeacher` |
| Self-assign | `AssignmentRepository.selfAssign` (transaction) |
| Resolve | `AssignmentRepository.resolveConflict` (one update) |
| Deactivate | `AssignmentRepository.deactivateAssignment` |
| Legacy tuple assign | `assignSubjectTeacher` upgraded to transactional/conflict-aware |

Reuse `withErrorHandling`, `ScopedRepositoryProvider`, `getAcademicId`.

## Configuration

- `auto_approve` per-school, default `0`; `1` = enabled. **Off by default.**
- Read uncached for immediate disable; admin/IT writes only.
- Disabling blocks new self-assign; existing assignments remain.
- Compatibility loan; verify no legacy InfixEdu use. No new column.

## Eligibility

`auto_approve=1`; staffId; **not** admin/IT; zero active assignments; staff active; class
active for school/year; every subject active in catalog. Any qualifying staff.

## Admin step 1 — class subjects

Class/section + catalog subjects. `createOfferings` selects existing rows in one query, then a
batch insert/reactivate: active → skip; inactive → reactivate with `teacher_id=NULL`; none →
insert. Returns `{ created, reactivated, skipped }`. No per-subject round trip.

## Admin step 2 — assign teacher

Offerings are loaded lazily for one class. `assignOfferingTeacher` checks the rows once, then
updates: no teacher → set; same → no-op; different → require `replace=true`; duplicates →
resolve first. Bulk one teacher, N ≤ 50, one update per offering.

## Conflicts

`listConflicts` is one grouped query (48 rows). Admin keeps one active row; one update
deactivates the rest. No deletes; co-teaching unsupported.

## Self-assign

Students → Add class (hidden when ineligible/toggle off). Class list = all active class
sections; inputs = class/section + catalog subjects. `selfAssign` transaction per subject:
`SELECT ... FOR UPDATE`; >1 → conflict; another teacher → reject; same → idempotent; NULL →
update; none → insert. All-or-nothing; N ≤ 50. On success set `selected-class` and
`invalidateAll()`.

## Deactivate

`deactivateAssignment` sets `active_status=0`, `updated_by`; validates school/year; no delete.
Removing the last assignment re-enables self-assign when the toggle is on.

## Audit

`created_by`/`updated_by`; no history table; latest state only.

## Query budget

| Operation | Max queries |
| --- | --- |
| Initial payload | 4 + offering count |
| Offerings per class | 1 |
| Create offerings | 2 |
| Assign teacher | 1 + N (≤50) |
| Self-assign | 2N (≤50) |
| Resolve conflict | 1 |
| Deactivate | 1 |
| Toggle | 1 |

No N+1; bounded ids/pages; select only needed columns; no all-offerings payload.

## Components

`manage-assignments-dialog.svelte`, `class-subject-step.svelte`,
`assign-teacher-step.svelte`, `conflict-panel.svelte`, `self-assign-dialog.svelte`,
`assignment-toggle.svelte`, `unassigned-empty-state.svelte` under
`src/lib/components/people/`. Each ≤400 lines.

## Validation and errors

Class/section active; subject ids active and ≤50; teacher active/same school; `replace` for a
different teacher; conflicts return a clear message and panel pointer; CSRF + server-side
authorization.

## Security and risk

Self-assign grants immediate student-data access; toggle off by default, admin/IT-only.
Unassigned staff may choose any active class; UI states access will be granted. Catalog-only
subjects. One-teacher invariant via `FOR UPDATE`. 48 duplicates block self-assign. No
cross-school reads/writes; no parent/student self-assign. Admin can disable/revoke.

## Acceptance

- Toggle off → no self-assign UI; POST 403.
- Toggle on + zero assignments + non-admin/IT → atomic self-assign; cookie; app usable.
- Toggle on + existing → hidden/403.
- Duplicate → rejected; conflict panel resolves.
- Admin batch offerings; assign/replace; lazy offerings.
- Deactivate removes access; no deletes; audit columns set.
- Unassigned staff reach `/people`; `/` and `/chat` redirect.
- Query budget met; no N+1; no all-offerings payload.
