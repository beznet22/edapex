# 05 — Server & Action Contract

Flows: [08-assignments.md](08-assignments.md),
[09-unassigned-bootstrap.md](09-unassigned-bootstrap.md).
Performance/repository rules: [10-performance-repositories.md](10-performance-repositories.md).

## Files

Data access extends existing repositories; there is no parallel `people/*-queries.ts` layer.

| File | Responsibility | Limit |
| --- | --- | --- |
| `src/routes/(chat)/people/+page.server.ts` | export `load` and `actions` | ≤400 |
| `src/routes/(chat)/people/people-load.ts` | authz + tab assembly | ≤400 |
| `src/routes/(chat)/people/people-actions.ts` | form actions | ≤400 |
| `src/routes/(chat)/people/+page.svelte` | composition only | ≤400 |
| `src/routes/(chat)/+layout.server.ts` | redirect unassigned staff | ≤400 |
| `src/lib/server/people/people-params.ts` | URL params/builder | ≤400 |
| `src/lib/server/people/people-access.ts` | access, allowed classes, eligibility | ≤400 |
| `src/lib/server/people/people-format.ts` | linked/email/badge/pager/validation | ≤400 |
| `src/lib/server/people/people-types.ts` | shared types | ≤400 |
| `src/lib/server/repository/staff.repo.ts` | **add** `listDirectory`; reuse options/create/update/status/photo | ≤400 |
| `src/lib/server/repository/parent.repo.ts` | **add** `listDirectory`, `updateContact` | ≤400 |
| `src/lib/server/repository/student.repo.ts` | **add** `getClassRosterPage`; keep existing roster method | ≤400 |
| `src/lib/server/repository/result.repo.ts` | **upgrade** `getClassSections`; **add** `getAssignedClassSections` | ≤400 |
| `src/lib/server/repository/assignment.repo.ts` | **add** offerings/conflicts/self-assign/resolve/deactivate; **upgrade** `assignSubjectTeacher` | ≤400 |
| `src/lib/server/service/settings.service.ts` | **add** get/set self-assign; reuse `getGeneralSettings` | ≤400 |
| `src/routes/api/uploads/+server.ts` | add `kind=staffPhoto` | ≤400 |
| `src/lib/components/people/unassigned-empty-state.svelte` | onboarding CTA | ≤400 |

## Repository methods (add only where necessary)

| Need | Method |
| --- | --- |
| Staff list + stats | `StaffRepository.listDirectory({ schoolId, q, status, includeInactive, sort, dir, page, pageSize })` |
| Staff options | reuse `getStaffRegistrationOptions()` |
| Staff create/edit/remove/photo | reuse `createStaff`, `updateStaff`, `updateStaffStatus`, `updateStaffPhoto` |
| Parent list + stats | `ParentRepository.listDirectory(...)` |
| Parent contact | `ParentRepository.updateContact(...)` (do not reuse `updateParentEmail`) |
| Admin class options | `ResultRepository.getClassSections({ schoolId, academicId })` (upgraded) |
| Teacher classes | `ResultRepository.getAssignedClassSections(...)` |
| Roster page | `StudentRepository.getClassRosterPage(...)` |
| Offerings/conflicts | `AssignmentRepository.listOfferings`, `listConflicts`, `createOfferings`, `assignOfferingTeacher`, `selfAssign`, `resolveConflict`, `deactivateAssignment` |
| Toggle | `SettingsService.get/setTeacherSelfAssignEnabled` |
| Academic year | reuse `BaseRepository.getAcademicId()` |
| Errors | reuse `withErrorHandling` |

Do not change the return shape of `StudentRepository.getStudentsByClassSection`; multiple
callers depend on it. Do not reuse `ParentRepository.updateParentEmail` (creates a user/updates
login).

## Query budget

| Operation | Max queries |
| --- | --- |
| Staff tab | 2 (rows + stats) + 4 options, only admin/Staff tab |
| Parents tab | 2 (rows + stats); 3–4 on year fallback |
| Students tab | 3 (classes + rows + stats) |
| Admin assignments | 4 (config/classes/subjects/conflicts) + 1 offering query per selected class |
| Self-assign | 3 (config/eligibility, classes, subjects) |
| Create offerings | 2 (select + batch write) |
| Assign teacher | 1 + N (N ≤ 50) |
| Self-assign action | 2N (N ≤ 50) |
| Resolve conflict | 1 |
| Toggle | 1 |

No query inside a row loop; no unbounded lists; `pageSize ≤ 100`; ids ≤ 50; select only needed
columns; independent queries via `Promise.all`; offerings are not sent until a class is
selected.

## Access and bootstrap

```
canManage = isAdministrator === true
         || designation === "admin" || designation === "it"

hasActiveAssignments = EXISTS(active sm_assign_subjects for staff/school/year)

if (canManage)                 -> all tabs + assignment management
else if (user.staffId)         -> students tab
                                  allowed classes = distinct active assignments
                                  if none: onboarding empty state
else                           -> 403
```

Redirect (`(chat)/+layout.server.ts`):

```
if (user.staffId && !canManage && !hasActiveAssignments
    && (pathname === "/" || pathname.startsWith("/chat"))) {
  redirect(302, "/people?onboarding=1");
}
```

- `/people` exempt; admin/IT and non-staff never redirected; no active year → no redirect.
- Decision is DB-based, never cookie-based.
- Never use `resolveActiveClassScope`, unparameterized `getClassSections()`, or
  `resolveAssignedClass`/`getAssignedClassSection` for authorization.
- Requested class must be in the allowed set.
- Mutations require `canManage`; `selfAssign` requires eligibility.
- Every mutation re-checks `school_id` and active year.

## Load input

`+page.server.ts` reads `url.searchParams`; `people-params.ts` normalizes:

| Param | Allowed | Default | Invalid |
| --- | --- | --- | --- |
| `tab` | `staff`, `parents`, `students` | admin `staff`; teacher `students` | default |
| `q` | trimmed ≤100 | `""` | truncate; <2 chars → `""` |
| `status` | per-tab enum | `all` | `all` |
| `sort` | per-tab enum | staff `name`; parents `name`; students `name` | default |
| `dir` | `asc`, `desc` | `asc` | `asc` |
| `page` | integer ≥1 | `1` | clamp 1 |
| `pageSize` | `25`, `50`, `100` | `25` | `25` |
| `includeInactive` | `true`/`false` | `false` | `false` |
| `classId` | positive integer | `null` | ignored unless allowed |
| `sectionId` | positive integer/null | `null` | ignored unless allowed |
| `onboarding` | flag | absent | UI hint |

`tab=duplicates` invalid → default tab.

Status enums:

- Staff: `all`, `active`, `inactive`, `no_email`, `linked`, `unlinked`.
- Parents: `all`, `linked`, `unlinked`, `no_email`, `non_gmail`, `duplicate`.
- Students: `all` (no filter menu).

Sort enums:

- Staff: `name`, `role`, `status`; Parents: `name`, `status`, `email`; Students: `name`.

## Load output

```ts
type PeoplePageData = {
  tab: "staff" | "parents" | "students";
  canManage: boolean;
  viewer: {
    staffId: number | null;
    allowedClasses: ClassOption[];
    hasActiveAssignments: boolean;
    noClassAssigned: boolean;
  };
  filters: NormalizedFilters;
  assignment?: {
    enabled: boolean;
    canSelfAssign: boolean;
    subjects: SubjectOption[];
    classes: ClassOption[];
    conflicts: ConflictGroup[];
    offeringCount: number;   // offerings fetched lazily per class
  };
  staff?: { rows; total; stats; options };
  parents?: { rows; total; stats; yearFallback };
  students?: { classes; selected; rows; total; stats };
};
```

- `/people` load must not call workspace/tenant resolvers or filesystem helpers.
- `enabled` is read uncached from `sm_general_settings.auto_approve`.
- Non-staff: `error(403)`.
- No active year: staff/parents load; students empty classes.

## Actions

All POST actions are school-scoped, CSRF-protected, and return `fail(400, { error })` with a
safe message. Raw DB errors are logged and mapped.

### `?/createStaff`, `?/updateStaff`, `?/deactivateStaff`
Reuse `StaffRepository.createStaff/updateStaff/updateStaffStatus`; temp password once; soft
remove. Require `canManage` and school ownership.

### `?/updateParentContact`
Fields `parentId`, `guardianEmail`, `guardianMobile`; optional, validated when present; empty
clears. Calls `ParentRepository.updateContact`; no user changes; no delete.

### `?/setSelfAssignEnabled`
Field `enabled`. Admin/IT. Calls `SettingsService.setTeacherSelfAssignEnabled`; disabling
blocks new self-assign; existing assignments remain.

### `?/createOfferings`
Fields `classId`, `sectionId`, `subjectIds` (≤50). Admin/IT. Calls
`AssignmentRepository.createOfferings`; returns `{ created, reactivated, skipped }`.

### `?/assignTeacher`
Fields `offeringIds` (≤50), `teacherId`, `replace`. Admin/IT. Calls
`assignOfferingTeacher`; replacement requires `replace=true`; conflicts resolved first.

### `?/loadOfferings`
Admin/IT. Fields `classId`, `sectionId`. Returns bounded offerings for that class so the
initial load does not ship all 463 rows. May be a JSON endpoint, but must use
`AssignmentRepository.listOfferings`.

### `?/resolveConflict`
Fields `classId`, `sectionId`, `subjectId`, `keepRowId`. Admin/IT. Keeps one active row and
deactivates the rest.

### `?/deactivateAssignment`
Field `offeringId`. Admin/IT. Sets `active_status = 0`; no delete.

### `?/selfAssign`
Fields `classId`, `sectionId`, `subjectIds` (≤50). Eligible staff: `auto_approve=1`, staffId,
not admin/IT, zero active assignments, active class, catalog subjects. Calls
`AssignmentRepository.selfAssign` (transaction, all-or-nothing). On success set
`selected-class` cookie and let the client `invalidateAll()`.

### Photo upload
`/api/uploads` gains `kind=staffPhoto` with `file`, `staffId`: `canManage`, same school,
JPEG/PNG/WebP ≤5MB, SHA-256 name under `static/uploads/staff/`, update
`sm_staffs.staff_photo` via the existing repository method.

## Client state and URL rules

- URL drives tab/search/status/sort/dir/page/pageSize/include/class.
- Search debounce 300ms; min 2 chars; `goto(buildPeopleUrl(...), { replaceState: true,
  keepFocus: true, noScroll: true })`.
- Any of tab/q/status/sort/dir/includeInactive/pageSize/classId/sectionId resets page 1.
- Pagination `noScroll: false`; search/filter `true`.
- Dialog state local; after success `invalidateAll()`, close, toast.
- Self-assign success: `invalidateAll()` + navigate to the assigned roster.

## Security checklist

- No cross-school reads/writes; active year enforced.
- Teacher scope from all active assignments; cookie/URL never widen.
- Admin class list school-filtered.
- Redirect decision DB-based; `/people` exempt.
- `selfAssign` re-checks toggle, role, zero assignments, catalog, conflicts in transaction.
- `auto_approve` read uncached.
- No credentials/hashes/tokens in load output.
- Temp password once, never logged.
- File name hashed; no path control.
- No parent delete endpoint.
- No N+1, unbounded lists, or all-offerings payload.
