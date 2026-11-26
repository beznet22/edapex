# 01 — Feature Inventory

Source: `/home/beznet/Workspace/edapex/apps/web/components/admin/` on
`feat/infinity-agent-runtime`, plus legacy-specific assignment/bootstrap features. Every
feature is **Supported** (existing schema), **Adapted** (legacy mechanism), or **Omitted**
(`04`).

**KPI** = key performance indicator; here, the summary metric cards above the tabs. KPIs are
computed over the full filtered dataset, not just the current page.

## Page shell

| Feature | Source behaviour | Status |
| --- | --- | --- |
| Page title | "People" for admin, "My class" for non-admin | Adapted: "People" for admin/IT, "Class roster" for teachers |
| Description | Admin/teacher-specific sentence | Supported |
| Header actions | Add staff, Add student (inert in source) | Adapted: Add staff + Manage assignments (admin); Add class (unassigned staff) |
| KPI strip | Grouped card + two figures | Supported, filestore-styled |
| Tabs | Staff, Parents, Students, Duplicates | Adapted: three tabs; Duplicates omitted |
| Search | Staff: name/email/phone; Parents: name/email; Students: name/admission | Supported |
| Filter menu | Status filters + "Include removed people" | Adapted per tab |
| Sort menu | Name/Role/Status; parents Name/Status/Email | Adapted, server-side |
| Pagination | Staff keyset cursor; Parents page/pageSize; Students none | Adapted: uniform offset paging 25/50/100 |
| Grid/List toggle | Comment only in source | Omitted |
| Row selection + bulk bar | Checkbox column; request links | Omitted |
| Bulk link panel | Issued links with copy | Omitted |
| Error banner | Destructive-tinted message | Supported |
| Loading skeleton | Row-shaped shimmer | Supported |
| Empty states | Per-tab messages | Supported |

## Unassigned bootstrap

The rest of the app requires a class/workspace (`422 TENANT_SCOPE_REQUIRED`, onboarding
failure, filestore unavailable). `/people` is the bootstrap surface:

- `/people` loads without a class, section, workspace or `selected-class` cookie; it uses
  direct DB queries only.
- Sidebar People is visible to all authenticated users.
- Unassigned non-admin/IT staff hitting `/` or `/chat` are redirected to
  `/people?onboarding=1`; `/people` is exempt to prevent loops.
- Empty state: “No class assigned yet.”
  - Toggle on → **Add class** (self-assign).
  - Toggle off → “Ask an administrator to enable self-assignment or assign you.”
- Successful self-assign sets `selected-class`, calls `invalidateAll()`, and unblocks chat/
  filestore. Detailed rules: [09-unassigned-bootstrap.md](09-unassigned-bootstrap.md).

## Staff tab

### Table

| Column | Source | Legacy mapping | Status |
| --- | --- | --- | --- |
| Checkbox | select rows | — | Omitted |
| Name + photo | `PersonCell` | `sm_staffs.full_name`, `staff_photo` | Supported |
| Contact | email + mobile | `email`, `mobile` | Supported |
| Role | department/designation | `sm_designations.title`, `sm_human_departments.name` | Supported |
| Account | Linked / No account | `user_id > 1` + `users` row | Adapted |
| Actions | menu | Edit, Remove, Manage classes | Adapted |

Mobile: cards below `md`; table at `md` and above.

### Controls

- Search: name, email, mobile (server-side `LIKE`).
- Status: All, Active only, Inactive only, No email, Linked, Unlinked.
- Include removed people: off = `active_status = 1` only.
- Sort: Name, Role, Status; asc/desc.
- Paging: 25/50/100.

### Actions

| Feature | Source | Legacy |
| --- | --- | --- |
| Add staff | Record only | Adapted: first/last/email + designation/department/role/gender; creates `users` + `sm_staffs`; temp password once |
| Edit staff | Name/email/mobile | Supported (+ qualification/experience) |
| Photo | JPEG/PNG/WebP ≤5MB | `/api/uploads` `kind=staffPhoto` |
| Remove | Soft deactivate | Sets `active_status = 0` on both rows |
| Manage classes | Not in source | Admin assignment flow for this teacher |
| Link/claim | Claim modal | Omitted (no claim-link table) |

### KPIs

Active / Account / No email; Linked figure + percentage; Needs attention = no email.
Aggregates cover the full filtered set, not only the page.

## Parents tab

### Table (contact editable, no delete)

| Column | Legacy mapping |
| --- | --- |
| Name | `COALESCE(guardians_name, fathers_name, mothers_name)` |
| Contact | `guardians_email`; `COALESCE(guardians_mobile, fathers_mobile, mothers_mobile)`; non-Gmail + Duplicate badges |
| Account | Linked / Unlinked |
| Actions | **Edit contact only** (no Link/Revoke/Delete) |

Edit contact updates `guardians_email` and `guardians_mobile` only; no user creation or login
change, no delete/deactivate. Empty values clear; email validated when present.

Controls: search name/email/phone; status linked/unlinked/no email/non-Gmail/duplicate;
sort name/status/email; paging 25/50/100; active-year scope with fallback notice.
KPIs: Linked / Unlinked / Duplicate email + Linked % + Needs attention = duplicate.

## Students tab

### Scoping

- Teacher allowed classes = distinct `(class_id, section_id)` from active
  `sm_assign_subjects` rows for staff/school/active year; all rows allowed.
- Admin/IT = all active `sm_class_sections` for school/year.
- Cookie/URL accepted only when in the allowed set.
- Zero assignments → onboarding empty state (not a 403).
- Multiple subject assignments → multiple allowed classes.

### Picker and roster

- Admin: all school classes; prompt until selected.
- Teacher: allowed classes; auto-select when one.
- Roster: Student, Admission no, Class, Status; search name/admission; sort name; paging.
- KPIs: Students, Active, No admission; On roll; Needs attention = no admission.

## Assignment management (legacy addition)

Detailed contract: [08-assignments.md](08-assignments.md).

- **Admin step 1:** choose class/section, multi-select active catalog subjects; create
  offerings (`teacher_id NULL`).
- **Admin step 2:** choose offerings + teacher; replacement requires confirmation.
- **Toggle:** existing `sm_general_settings.auto_approve`; `1` enabled, `0` disabled;
  **off by default**; admin/IT only; uncached read.
- **Self-assign:** any non-admin/IT staff with zero active assignments; toggle on; catalog
  subjects only; immediate access; sets `selected-class`; invalidates.
- **Conflicts:** 48 existing duplicate active groups; self-assign blocked on them; admin
  conflict panel keeps one and deactivates the rest.
- **Deactivate:** admin can deactivate an assignment; no row deletion.

## Cross-cutting behaviours

- Failed load clears rows/totals and shows one error banner.
- Tab/search/filter/page-size changes reset page to 1.
- Skeleton announced with `aria-busy`.
- Percentages are real ratios.
- Sort is server-side.
- Focus returns to the trigger on dialog close.
- Toasts announce create/update/remove/photo, parent-contact, assignment and onboarding
  outcomes.

## Status legend

- **Supported** — direct mapping to existing columns.
- **Adapted** — existing legacy mechanism, documented deviation.
- **Omitted** — impossible without new schema; listed in `04-exclusions.md`.
