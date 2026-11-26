# 03 — Data Mapping

All queries are read-only except staff mutations, parent contact updates and assignment
actions (`08-assignments.md`). No table or column is added; no index is created. `/people`
must load without a class/workspace; see `09-unassigned-bootstrap.md`.

## Scoping principles

- `schoolId = locals.user.schoolId ?? 1` on every query.
- `academicId` = active academic year: date range containing today, else newest
  `active_status = 1` row (same rule as `BaseRepository.findActiveAcademicYear`).
- Staff/parents are school-wide for admins; students are class-scoped.
- Admin/IT class options: active `sm_class_sections` for school/year.
- Teacher class options: distinct active `sm_assign_subjects` rows for staff/school/year.
  **All** rows allowed, not just the first.
- URL/cookie class values never widen the allowed set.
- Unassigned staff have no allowed classes; `/people` shows onboarding, not a 403.
- `linked` is derived, never stored.

## Scoping investigation (current code)

| Component | Behaviour | Consequence |
| --- | --- | --- |
| `resolveActiveClassScope` | URL `className`/`sectionName` → `selected-class` cookie → `resolveAssignedClass(staffId)` | Cookie/URL can override the assignment; unsafe for authorization |
| `resolveAssignedClass` | Reads `sm_assign_subjects`, `.limit(1)` | Subject→class model confirmed, but multi-class teachers under-scoped |
| `getAssignedClassSection` | Same lookup, `.limit(1)` | Same limitation |
| `getClassSections` | All active `sm_class_sections` for the year; **no `school_id` filter** | Cannot be used directly for a tenant list |
| `class-selector.svelte` | Visible to every non-`class_teacher` designation; writes `selected-class` | Subject teachers can pick any class at the UI level |
| Layout seed | `class_teacher` with assigned section, or admin/IT with one class | Others fall back to selector/empty state |
| App gate | `ChatComposer` returns `422 TENANT_SCOPE_REQUIRED`; onboarding/filestore require a class | Unassigned staff are blocked outside `/people` |

`/people` implements its own resolver:
1. Admin/IT → all school class sections for the year.
2. Other staff → distinct active `sm_assign_subjects` rows.
3. Requested class must be in the set; otherwise first allowed or empty state.
4. `resolveActiveClassScope`, `getAssignedClassSection`, `getClassSections` are not used for
   authorization.

## Linked rule

```
linked = user_id IS NOT NULL AND user_id > 1 AND EXISTS (users.id = user_id)
```

`user_id = 1` is the super-admin (confirmed). Legacy defaults `sm_staffs.user_id` and
`sm_parents.user_id` to `1`, so `1` is unlinked.

## Bootstrap query

```sql
SELECT COUNT(*) AS active_assignments
FROM sm_assign_subjects
WHERE teacher_id = ?
  AND school_id = ?
  AND academic_id = ?
  AND active_status = 1
```

Used by `(chat)/+layout.server.ts` to redirect unassigned non-admin/IT staff from `/` and
`/chat` to `/people`, and by the page to decide whether to show the onboarding empty state.
The decision is DB-based, never cookie-based.

## Staff

### Fields

| UI | Source | Column |
| --- | --- | --- |
| id | row key | `sm_staffs.id` |
| full name | Name | `sm_staffs.full_name` (fallback first + last) |
| photo | avatar | `sm_staffs.staff_photo` |
| email | Contact | `sm_staffs.email` |
| phone | Contact | `sm_staffs.mobile` |
| designation | Role | `sm_designations.title` via `designation_id` |
| department | Role | `sm_human_departments.name` via `department_id` |
| active | Status | `sm_staffs.active_status = 1` |
| linked | Account | rule above via `user_id` |
| has email | No email KPI | `email` non-null/non-empty |

### Filters, sorts, search, paging

- Filters: `all`, `active`, `inactive`, `no_email`, `linked`, `unlinked`.
- `all` only active unless “Include removed people” is checked.
- Sorts: `name`, `role` (`COALESCE(designation, department)`), `status`.
- Search: name/email/mobile `LIKE`; term ≤100 chars.
- Offset paging 25/50/100; total uses the same `WHERE`.

### KPI aggregates

```sql
SELECT COUNT(*) AS total,
       SUM(active_status = 1) AS active,
       SUM(email IS NULL OR email = '') AS no_email,
       SUM(user_id > 1 AND u.id IS NOT NULL) AS linked
FROM sm_staffs s
LEFT JOIN users u ON u.id = s.user_id
WHERE <filters>
```

`Linked %` = `round(linked / total * 100)` when total > 0.

## Parents

### Fields

| UI | Source | Column |
| --- | --- | --- |
| id | row key | `sm_parents.id` |
| name | Name | `COALESCE(guardians_name, fathers_name, mothers_name)` |
| email | Contact | `guardians_email` |
| phone | Contact | `COALESCE(guardians_mobile, fathers_mobile, mothers_mobile)` |
| linked | Account | rule above via `user_id` |
| non-Gmail | badge | email present and not `@gmail.com` |
| duplicate | badge | same email on >1 parent row in scope |

### Contact update

- Editable: `guardians_email`, `guardians_mobile`; both may be cleared.
- Update only `sm_parents`; no user insert/update; no delete/deactivate.
- `ParentRepository.updateParentEmail` is not reused (creates user/changes login).
- Duplicates allowed; badge remains.

### Academic scope and duplicate detection

Default `school_id = ? AND academic_id = ?`; zero rows → re-run with only school and set
`yearFallback: true`.

```sql
EXISTS (
  SELECT 1 FROM sm_parents p2
  WHERE p2.school_id = p.school_id
    AND p2.guardians_email = p.guardians_email
    AND p2.id <> p.id
    AND p2.guardians_email IS NOT NULL AND p2.guardians_email <> ''
    [AND p2.academic_id = p.academic_id]
)
```

### Filters, sorts, KPIs

- Filters: `all`, `linked`, `unlinked`, `no_email`, `non_gmail`, `duplicate`.
- Sorts: `name`, `status` (linked), `email`.
- KPIs: total/linked/unlinked/no email/duplicate; Needs attention = duplicate.
- Paging 25/50/100.

## Students

### Class options — admin/IT

```sql
SELECT cs.class_id, c.class_name, cs.section_id, s.section_name
FROM sm_class_sections cs
JOIN sm_classes c ON c.id = cs.class_id AND c.active_status = 1
LEFT JOIN sm_sections s ON s.id = cs.section_id AND s.active_status = 1
WHERE cs.school_id = ? AND cs.academic_id = ? AND cs.active_status = 1
ORDER BY c.class_name, s.section_name
```

Replaces `getClassSections()`, which omits `school_id`.

### Class options — teacher

```sql
SELECT DISTINCT a.class_id, c.class_name, a.section_id, s.section_name
FROM sm_assign_subjects a
JOIN sm_classes c ON c.id = a.class_id AND c.active_status = 1
LEFT JOIN sm_sections s ON s.id = a.section_id AND s.active_status = 1
WHERE a.teacher_id = ? AND a.school_id = ? AND a.academic_id = ?
  AND a.active_status = 1
ORDER BY c.class_name, s.section_name
```

All distinct rows allowed; no `.limit(1)`.

### Selection and roster

- Requested class must be in the allowed set; teacher gets first allowed, admin none/first
  when one.
- Roster joins `sm_students` + `student_records` + classes/sections, filtered by school,
  academic year, class/section, `is_default = 1`, `active_status = 1`, `is_graduate = 0`.
- Search name/admission; sort name; offset paging.
- KPIs: total, active, no admission.

## Assignments & self-assignment

Detailed flows: [08-assignments.md](08-assignments.md).

### Model

| Concept | Representation |
| --- | --- |
| Offering | `sm_assign_subjects` row with `teacher_id = NULL`, `active_status = 1` |
| Assignment | Same row with `teacher_id` set |
| Deactivated | `active_status <> 1` |
| Catalog | `sm_subjects` active rows for school/year |
| Toggle | `sm_general_settings.auto_approve`: `1` enabled, `0` disabled |

No unique index on `(school, academic, class, section, subject)`; one active teacher is an
application invariant.

### Live data

| Check | Value |
| --- | --- |
| `sm_assign_subjects` rows | 463 |
| Unassigned offerings | 0 |
| Duplicate active groups | 48 |
| Teachers / class-sections | 46 / 52 |
| `auto_approve` | 0 |
| `infixedu__settings` rows | 0 |

### Eligibility

Self-assign when `auto_approve = 1`, `staffId` present, the user is **not admin/IT**, and
active assignments = 0. Any staff with zero assignments qualifies.

### Catalog

```sql
SELECT id, subject_name, subject_code, subject_type
FROM sm_subjects
WHERE school_id = ? AND academic_id = ? AND active_status = 1
ORDER BY subject_name
```

No free text; no new subject rows.

### Conflict query

```sql
SELECT class_id, section_id, subject_id, COUNT(*) AS active_teachers,
       GROUP_CONCAT(teacher_id ORDER BY teacher_id) AS teacher_ids
FROM sm_assign_subjects
WHERE school_id = ? AND academic_id = ? AND active_status = 1
GROUP BY school_id, academic_id, class_id, section_id, subject_id
HAVING COUNT(*) > 1
```

48 groups currently. Self-assign is blocked on any tuple in this result.

### Atomic self-assign

Transaction, per subject:

1. `SELECT id, teacher_id ... FOR UPDATE`.
2. >1 row → conflict; roll back all.
3. Row with another teacher → “already assigned”; roll back all.
4. Row with caller → idempotent success.
5. Row with `NULL` → update to caller.
6. No row → insert with caller.

All selected subjects are atomic. On success, set `selected-class` cookie and
`invalidateAll()` (`09-unassigned-bootstrap.md`).

### Admin assignment and conflicts

- Step 1 creates/reactivates offerings with `teacher_id = NULL`.
- Step 2 assigns; replacing a different teacher requires `replace=true`.
- Conflict panel keeps one row and deactivates the rest.
- Deactivate assignment sets `active_status = 0`; no deletes.

### Audit

`created_by`/`updated_by` record the actor. No history table; latest state only.

## Derived presentation values

| Value | Rule |
| --- | --- |
| Initials | First/last token initials, uppercase; `?` when empty |
| Avatar fallback | `bg-muted text-muted-foreground` |
| Status pill | Staff Active/Inactive; Parents Linked/Unlinked; Students Active/Inactive |
| Contact line | Email first, phone second when present |
| Role line | Designation, else department, else `—` |
| Class line | `className · sectionName`, else `—` |

## Performance notes

- No new indexes; `LIKE '%term%'` scans, capped/debounced.
- KPI queries reuse the filtered `WHERE`.
- Option lists are small; load only for the relevant tab/dialog.
- All queries school-scoped and academic-year scoped where applicable.
