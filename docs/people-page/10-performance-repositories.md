# 10 — Performance & Repository Reuse

Performance is a hard requirement. Data access extends the existing per-request repositories;
it does not create a parallel query layer. New methods are added only where no existing method
can be upgraded without breaking callers.

## Current scale and indexes (read-only checks)

- MariaDB 11.5.2.
- Rows: 87 staff, 567 parents, 900 students, 39 subjects, 71 class-sections, 463 assignments.
- Parent academic distribution: 470 in year 1, 97 in year 4 (active year is 4).
- Indexes exist on foreign keys (`school_id`, `user_id`, `teacher_id`, `class_id`,
  `section_id`, `subject_id`, `academic_id`) and `sm_class_sections(class_id, section_id)`.
- **No name/email/admission indexes.** A `LIKE '%term%'` search is a school-scoped scan.
  At the current scale this is acceptable; adding an index is a schema change and is out of
  scope.

So the hard guarantees are structural: bounded result sets, no N+1, one aggregate query per
tab, lazy assignment payloads, and repository reuse.

## Repository reuse / upgrade matrix

| Need | Existing method | Action |
| --- | --- | --- |
| Staff list + stats | `StaffRepository.searchStaff` (dept/designation only, no paging) | **Add** `listDirectory(...)`; no existing method can serve pagination/stats |
| Staff form options | `StaffRepository.getStaffRegistrationOptions` | **Reuse** |
| Staff create/edit/remove/photo | `createStaff`, `updateStaff`, `updateStaffStatus`, `updateStaffPhoto` | **Reuse** |
| Parent list + stats | `ParentRepository.searchParentsByName` (limit 10, no paging) | **Add** `listDirectory(...)` |
| Parent contact update | `ParentRepository.updateParentEmail` (creates a user, changes login) | **Do not reuse**; **add** `updateContact(...)` |
| Admin class options | `ResultRepository.getClassSections()` | **Upgrade** to accept `{ schoolId?, academicId? }`; keep current call site behavior |
| Teacher allowed classes | `ResultRepository.getAssignedClassSection` (`.limit(1)`) | **Add** `getAssignedClassSections(...)`; keep the singular method for existing callers |
| Student roster page | `StudentRepository.getStudentsByClassSection` (array, no total) | **Add** `getClassRosterPage(...)`; keep the existing method unchanged |
| Assignment offering list/conflicts | `AssignmentRepository` has only `assignSubjectTeacher`/`assignClassTeacher` | **Add** `listOfferings`, `listConflicts`, `createOfferings`, `selfAssign`, `resolveConflict`, `deactivateAssignment` |
| Assign one offering | `assignSubjectTeacher` (check-then-write, not transactional) | **Upgrade** it to a conflict-aware transaction; **add** `assignOfferingTeacher` for id-based UI |
| Toggle read | `SettingsService.getGeneralSettings()` (direct DB) | **Reuse** |
| Toggle write | none | **Add** `setTeacherSelfAssignEnabled(...)` in `SettingsService` |
| Active academic year | `BaseRepository.getAcademicId()` | **Reuse** |
| Per-request repository/tenant | `ScopedRepositoryProvider` | **Reuse** |
| Error wrapping | `BaseRepository.withErrorHandling` | **Reuse** in every new method |

Page-specific modules remain only for orchestration: `people-load.ts`, `people-actions.ts`,
`people-params.ts`, `people-access.ts`, `people-format.ts`, `people-types.ts`. There are no
`people/staff-queries.ts`, `parent-queries.ts`, `student-queries.ts`, `assignment-queries.ts`,
`assignment-mutations.ts`, `parent-mutations.ts`, `staff-mutations.ts` or `people-settings.ts`.

## Query budget

| Operation | Max queries | Notes |
| --- | --- | --- |
| Staff tab (admin) | 2 + 4 options | Rows + stats; options via `getStaffRegistrationOptions`, only on Staff tab, parallel |
| Staff tab (teacher) | — | Staff tab hidden |
| Parents tab | 2 (3–4 on fallback) | Rows + stats; duplicate aggregate derived table |
| Students tab | 3 | Class options + roster rows + stats; parallel |
| Admin assignments dialog | 4 + 1 per selected class | Config, classes, subjects, conflicts; offerings loaded lazily for the chosen class |
| Self-assign dialog | 3 | Config/eligibility (from viewer) + classes + subjects |
| Create offerings | 2 | One select for existing rows + one batch insert/reactivate |
| Assign teacher | 1 + N | One select of offerings + one update per offering; N ≤ 50 |
| Self-assign | 2N | `SELECT … FOR UPDATE` + update/insert per subject; N ≤ 50 |
| Resolve conflict | 1 | One update |
| Toggle | 1 | One update |

Rules:

- **No query inside a row loop.** Joins/derived tables only.
- **No unbounded lists.** `pageSize ≤ 100`; subject/offering ids ≤ 50.
- **Select only needed columns.** No `SELECT *` in list paths.
- Independent queries run with `Promise.all`.
- KPI stats use one aggregate query with the same `WHERE` and conditional `SUM`.
- Do not ship all 463 offerings to the client; load offerings for the selected class.
- Class/subject option lists are bounded (71/39) and loaded only for the relevant tab.
- Toggle read is one row and intentionally uncached for correctness; all other config reads
  may reuse the per-request provider cache.

## Query shapes

### Staff list

One joined row query and one aggregate query:

```sql
SELECT s.id, s.full_name, s.email, s.mobile, s.staff_photo, s.active_status,
       d.title AS designation, h.name AS department,
       (s.user_id > 1 AND u.id IS NOT NULL) AS linked
FROM sm_staffs s
LEFT JOIN users u ON u.id = s.user_id
LEFT JOIN sm_designations d ON d.id = s.designation_id
LEFT JOIN sm_human_departments h ON h.id = s.department_id
WHERE s.school_id = ? AND <filters>
ORDER BY <whitelisted column> <dir>
LIMIT ? OFFSET ?;
```

Stats:

```sql
SELECT COUNT(*) AS total,
       SUM(s.active_status = 1) AS active,
       SUM(s.email IS NULL OR s.email = '') AS no_email,
       SUM(s.user_id > 1 AND u.id IS NOT NULL) AS linked
FROM sm_staffs s
LEFT JOIN users u ON u.id = s.user_id
WHERE s.school_id = ? AND <filters>;
```

No per-row lookups.

### Parents list

Rows use a **derived duplicate aggregate**, not a correlated subquery per row:

```sql
LEFT JOIN (
  SELECT guardians_email, COUNT(*) AS c
  FROM sm_parents
  WHERE school_id = ? AND academic_id = ?
    AND guardians_email IS NOT NULL AND guardians_email <> ''
  GROUP BY guardians_email
) dup ON dup.guardians_email = p.guardians_email
```

The same derived table is used for the stats query. Two scans total, not one per parent.

### Student roster

One joined row query + one aggregate query. Class options are a separate bounded query.

### Assignment offerings

`listOfferings` is scoped by `school_id`, `academic_id` and `class_id`/`section_id`; the
dialog loads it only after a class is selected. Conflicts are one grouped query (48 rows).
Subjects are one bounded query (39 rows).

## Search strategy

- Server-side only; no client-side filtering of full tables.
- 300ms debounce; minimum 2 characters before a server request.
- `LIKE '%term%'` on name/email/mobile/admission. No index can serve it; the plan is a
  school-scoped scan. At 87/567/900 rows this is the intended trade-off.
- Do not add an index without explicit approval; that is a schema change.
- Record `EXPLAIN` output for the staff, parent, student and assignment queries in
  `07-verification.md`; if a plan scans an unexpectedly large set, fix the query shape first.

## Parent scope note

The active year (4) contains 97 parents; year 1 contains 470. The spec defaults to the active
year. Before implementation, confirm whether historical parents must be visible; if yes, add
an explicit “All years” filter, not a silent unfiltered query. This is a product-scope decision,
not a performance one.

## Acceptance

- Every list path respects the query budget; no per-row queries.
- `pageSize` and ID arrays are capped.
- Staff/parents/students list queries are `EXPLAIN`-checked and recorded.
- Assignment offerings are not loaded until a class is selected.
- All new data access lives in existing repositories or `SettingsService`; the only new page
  modules are orchestration/validation.
- No schema/index change.
