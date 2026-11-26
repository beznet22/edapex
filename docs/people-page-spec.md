# `/people` Page Specification — Index

- **Status:** Revised draft for approval (implementation gated)
- **Target:** `/home/beznet/Workspace/legacy-maintenance` (`worktree-legacy-maintenance`)
- **Source of features:** `/home/beznet/Workspace/edapex` branch `feat/infinity-agent-runtime`
  (`apps/web/components/admin/UserManagementSurface.tsx` and its 12 companion components)
- **Layout reference:** `/home/beznet/Workspace/legacy-maintenance/src/routes/(chat)/filestore/+page.svelte`
- **Hard rule:** no new tables, columns, migrations or indexes. Existing schema only.

## Goal

Build a `/people` page in the legacy SvelteKit app that reproduces the supported features of
the new app's People page inside the `/filestore` visual shell. Staff and parents are
school-wide for administrators; students are class-scoped through a picker for administrators
and restricted to the teacher's subject-assigned classes. It also adds legacy-specific
assignment management: a two-step admin flow (class subjects, then teacher) and immediate
teacher self-assignment when enabled. `/people` is the bootstrap surface for staff who have no
assignment, because the rest of the app requires one.

**KPI** means *key performance indicator*. On this page it refers to the summary metric cards
above the tabs (for example Active / Account / No email, with a linked percentage). A KPI is
computed over the full filtered dataset, not only the current page.

**Teacher scope is subject-based:** a teacher belongs to a class only when an active
`sm_assign_subjects` row for the current academic year links their `staff_id` to that
`class_id`/`section_id`. A teacher may hold several such assignments; all of them are allowed.
The `selected-class` cookie and URL parameters are never used to widen that set.

## Non-negotiable constraints

1. **No schema change.** No edits under `src/lib/server/db/` or `drizzle/`; no new indexes.
2. **Existing tables only:** `sm_staffs`, `sm_parents`, `sm_students`, `student_records`,
   `sm_classes`, `sm_sections`, `sm_class_sections`, `sm_assign_subjects`, `sm_subjects`,
   `users`, `ai_sessions`, `sm_designations`, `sm_human_departments`, `infix_roles`,
   `sm_base_setups`, `sm_academic_years`, `sm_general_settings`.
3. **Filestore shell:** `ChatHeader`, centered `max-w-6xl` page, uppercase display title,
   pill search, `New` menu, pill tabs, `Filter` dropdown, KPI strip, real tables, pager.
   No grid/list toggle and no selection/bulk bar.
4. **Access:** `isAdministrator` or designation `admin`/`it` gets Staff, Parents, Students
   and assignment management. Other staff get only classes linked through active
   `sm_assign_subjects` rows; no assignment means the onboarding empty state (plus
   self-assign when enabled). Non-staff users get 403. The sidebar People item is visible to
   everyone.
5. **Mobile-first PWA:** designed at 320px first; touch targets ≥44px; safe-area padding;
   desktop tables become stacked cards below `md`; no horizontal page scroll; visible focus
   rings; `aria-busy` skeletons.
6. **Design tokens only:** semantic colors and radii from `src/routes/layout.css`
   (`bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`,
   `bg-primary`, `text-primary-foreground`, `bg-muted`, `ring-ring`, `rounded-sm/md/lg/xl`).
   Standard spacing/type utilities are allowed. No arbitrary `[...]` values, no raw colors.
7. **≤400 lines per file/component.** The spec itself is split for this reason.
8. **Repository-first data access.** Extend `StaffRepository`, `ParentRepository`,
   `StudentRepository`, `ResultRepository`, `AssignmentRepository` and `SettingsService`.
   Do not create a parallel query/mutation layer. Add a method only when no existing one can
   be upgraded without breaking callers.
9. **Performance budget.** Server pagination, no N+1, one aggregate query per tab, bounded
   lists, lazy assignment offerings, `EXPLAIN` checks. Full rules: `10`.
10. **Spec approval gate:** no page code starts until this package is approved.

## Decisions (summary)

| Decision | Choice |
| --- | --- |
| Unsupported source features | Omit and document; no substitutes |
| Layout | Filestore chrome + real tables + KPI strip |
| Paging | Server-side, 25/50/100 |
| Admin definition | `isAdministrator` or designation `admin`/`it` |
| Teacher view | All classes from active subject assignments |
| Admin Students tab | Class picker (all school classes), then roster |
| Class authorization | DB assignments only; ignore cookie/URL widening |
| Linked rule | `user_id > 1` and a matching `users` row |
| Add staff | Existing legacy repo with login + designation/department/role/gender |
| Parents tab | Contact editable; no delete |
| Duplicates tab | Omitted; duplicate badge on parent rows only |
| Parent scope | Active academic year (97 rows in live year 4) |
| Staff photo | Extend existing `/api/uploads` with `staffPhoto` |
| Token radius | `rounded-lg`/`rounded-xl`, not `rounded-3xl` |
| Assignment model | Offering row (`teacher_id NULL`) → teacher assignment |
| Admin assignment | Two-step: class subjects, then teacher |
| Self-assign toggle | Existing `sm_general_settings.auto_approve`; **off by default** |
| Self-assign eligibility | Any non-admin/IT staff with zero active assignments |
| Self-assign subjects | Active `sm_subjects` catalog only; may create the offering |
| Self-assign result | Immediate access; sets `selected-class` and invalidates |
| Unassigned bootstrap | `/people` reachable; redirect from `/` and `/chat` |
| Duplicate offerings | Block self-assign; admin conflict panel resolves |
| Data access | Extend existing repositories; no parallel query layer |
| Query budget | 2 queries per list tab + bounded options; lazy offerings |
| Search | School-scoped scan, 300ms debounce, min 2 chars |
| Spec shape | Index + topic files, each ≤400 lines |

## Document map

1. [Feature inventory](people-page/01-features.md) — source features + legacy additions.
2. [Layout & responsive blueprint](people-page/02-layout-responsive.md) — structure, widths, PWA.
3. [Data mapping](people-page/03-data-mapping.md) — field → table.column, filters, sorts, KPIs.
4. [Exclusions](people-page/04-exclusions.md) — unsupported source features and missing schema.
5. [Server & action contract](people-page/05-server-actions.md) — load params, returns, mutations.
6. [Design review](people-page/06-design-review.md) — tokens, mobile, scoping, data integrity.
7. [Verification](people-page/07-verification.md) — commands, DB checks, tests, manual matrix.
8. [Assignments & self-assignment](people-page/08-assignments.md) — two-step flow, toggle, conflicts.
9. [Unassigned bootstrap](people-page/09-unassigned-bootstrap.md) — redirect + reachable onboarding.
10. [Performance & repositories](people-page/10-performance-repositories.md) — reuse, budgets, EXPLAIN.

## Scope at a glance

| Tab / flow | Admin/IT | Teacher | Data source |
| --- | --- | --- | --- |
| Staff | school-wide, full actions | hidden | `sm_staffs` + `users` |
| Parents | school-wide, contact edit only | hidden | `sm_parents` + `users` |
| Students | class picker + roster | subject-assigned classes only | `sm_students` + `student_records` |
| Assignments | offerings, teachers, conflicts, toggle | self-assign when enabled | `sm_assign_subjects` + `sm_subjects` |
| Duplicates | omitted | omitted | — |

## Acceptance summary

- Spec files exist, are cross-linked, and each is ≤400 lines.
- Every source feature appears either as implemented/adapted or in the exclusion matrix.
- Parent contact is editable; parents cannot be deleted.
- Teacher class access is derived from active `sm_assign_subjects`; cookie/URL cannot widen it.
- Admin can create offerings then assign a teacher; replacement requires confirmation.
- Toggle is off by default; any non-admin/IT staff with zero assignments can self-assign when
  enabled, immediately, from the catalog.
- Duplicate offerings block self-assign; the admin conflict panel resolves them.
- Unassigned staff hitting `/` or `/chat` are redirected to `/people`; `/people` loads without
  a class/workspace.
- Data access extends existing repositories; no parallel query layer.
- Query budget is met; no N+1; list queries are `EXPLAIN`-checked and recorded.
- After approval: `pnpm check`, `pnpm test:unit`, `pnpm build` pass; no diff under
  `src/lib/server/db/` or `drizzle/`.
- Manual smoke covers admin, multi-class teacher, unassigned teacher (toggle on/off),
  redirect/loop, conflicts, non-staff, 320/375/768 widths, light/dark, URL state and reload.

## Implementation sequence (after approval)

1. Repository upgrades + query-budget helpers + unit tests.
2. Access/eligibility/params helpers.
3. Route shell, URL state, KPI, pager, shared table.
4. Staff tab and existing staff mutations.
5. Parents tab with contact edit.
6. Students tab with subject-based class picker.
7. Assignments: toggle, two-step admin flow, self-assign, conflict panel.
8. Unassigned bootstrap: redirect, empty state, cookie/invalidate.
9. Sidebar entry, access polish, responsive/token audit, EXPLAIN + full verification.

## Approval gate

This package is the only deliverable of the current step. Implementation begins only after the
user explicitly approves this spec.
