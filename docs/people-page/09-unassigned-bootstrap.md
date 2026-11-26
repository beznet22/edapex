# 09 — Unassigned Teacher Bootstrap

## Problem

The app gates most operations on a resolvable class/workspace:

- `ChatComposer` documents `422 TENANT_SCOPE_REQUIRED` when no class is active.
- `SharedChatView` onboarding fails with “missing class, section, or staff assignment”.
- Filestore throws when the tenant workspace cannot be resolved.
- `nav-user` shows an “Unassigned” badge, but there is no self-service path to fix it.

An unassigned teacher therefore logs in and can do nothing. `/people` is the escape hatch.

## Rule 1 — `/people` is the bootstrap surface

`/people` must load without a class, section, workspace, or selected-class cookie:

- Do **not** call `resolveTenantWorkspace`, `resolveActiveClassScope`, `resolveTenantFilesystem`
  or any filestore/workspace helper in the `/people` load.
- Use `locals.user` and direct DB queries only.
- `ChatHeader` has no class dependency and is safe to render.
- `(chat)/+layout.server.ts` may run, but `/people` must not depend on `assignedSection`,
  `students`, or workspace tokens being non-null.
- The sidebar People item is visible to every authenticated staff user, including
  unassigned users.

## Rule 2 — Redirect unassigned staff from chat roots

In `(chat)/+layout.server.ts` (or the root load), after `locals.user` is known:

```
isAdminOrIt = user.isAdministrator === true
           || user.designation === "admin"
           || user.designation === "it"

hasActiveAssignments = EXISTS (
  SELECT 1 FROM sm_assign_subjects
  WHERE teacher_id = user.staffId
    AND school_id = ?
    AND academic_id = ?
    AND active_status = 1
)

if (user.staffId && !isAdminOrIt && !hasActiveAssignments) {
  if (pathname === "/" || pathname.startsWith("/chat")) {
    redirect(302, "/people?onboarding=1");
  }
}
```

- Never redirect `/people` itself (loop prevention).
- Never redirect admins/IT: they can legitimately have no subject assignment.
- Never redirect non-staff: `/people` returns 403 for them.
- Do not use the `selected-class` cookie or URL params to decide; use the DB count.
- If no active academic year exists, do not redirect (there is nothing to assign yet);
  `/people` shows the empty state.
- The query is one indexed lookup on `teacher_id`; cache it per request.

## Rule 3 — Empty state and CTA

`/people` for an unassigned staff member shows the Students tab with:

- Title: “No class assigned yet”.
- Body: “The rest of the app needs a class, section and subject assignment before it can be
  used.”
- If `auto_approve = 1`: primary button **Add class** opens the self-assign dialog.
- If `auto_approve = 0`: no self-assign control; message “Ask an administrator to enable
  self-assignment or assign you to a class.”
- A muted link: “Learn what gets unlocked” (optional) explaining roster, chat and filestore.

The empty state is not an error; it is the onboarding state. Do not show a 403 or a generic
error banner.

## Rule 4 — Self-assign unblocks the app

On successful self-assign:

1. Write the assignments atomically (`08-assignments.md`).
2. Set the `selected-class` cookie for the caller:
   `{ classId, sectionId, academicId, className, sectionName }`, `httpOnly`, `sameSite=lax`,
   `path=/`, one-year max age. Only after the assignment is committed.
3. `invalidateAll()` so `(chat)/+layout.server.ts` re-runs and rehydrates
   `assignedSection`/`classes`.
4. Navigate to `/people?tab=students&classId=…&sectionId=…`.
5. The redirect rule no longer applies because the teacher now has an active assignment.

The cookie is a convenience for the workspace resolver, not authorization. `/people` still
derives access from `sm_assign_subjects`.

## Rule 5 — Toggle-off path

- `auto_approve = 0` (default): unassigned staff see the admin instruction, not a self-assign
  button.
- Direct POST to `?/selfAssign` returns 403.
- Admin assignment (`08-assignments.md`) is the only unblock.
- After the admin assigns, the teacher’s next load resolves the class:
  - `class_teacher`: layout seeds `selected-class` when the cookie is empty and
    `assignedSection` exists.
  - Other staff: the class selector lists allowed classes; the teacher chooses one.
- Document this operational dependency for admins: **either enable self-assign or assign
  new teachers before they log in.**

## Rule 6 — Admin/IT are not unassigned-blocked

Admins/IT often have no `sm_assign_subjects` row. They must not be redirected or shown the
teacher empty state. Their `/people` view is the management surface, not onboarding.

## Rule 7 — Sidebar and navigation

- People is visible to all authenticated users.
- For unassigned staff, label the item with a small “Setup” badge and keep it above
  class-dependent entries.
- The `Unassigned` badge in `nav-user` may link to `/people?onboarding=1` (optional polish;
  no behavior depends on it).
- Do not hide the sidebar for unassigned users; they need the route.

## Failure modes

| Case | Behavior |
| --- | --- |
| Toggle off, no admin action | Empty state with admin instruction; app remains gated |
| Toggle on, conflict tuple | Self-assign rejected; admin conflict panel unblocks |
| Toggle on, subject not in catalog | Subject not selectable; no free text |
| Toggle on, class not active for year | Class absent from picker; rejected server-side |
| Toggle on, second attempt | Self-assign hidden because the teacher now has an assignment |
| Admin/IT with no class | No redirect; management surface works |
| Non-staff user | 403 on `/people`; no redirect loop |
| No active academic year | No redirect; `/people` shows the empty state |

## Files

| File | Change |
| --- | --- |
| `src/routes/(chat)/+layout.server.ts` | redirect unassigned staff from `/` and `/chat` |
| `src/lib/server/people/people-access.ts` | `hasActiveAssignments`, eligibility |
| `src/routes/(chat)/people/people-load.ts` | load without class/workspace; onboarding flag |
| `src/routes/(chat)/people/people-actions.ts` | self-assign sets cookie, invalidate |
| `src/lib/components/people/unassigned-empty-state.svelte` | CTA/instruction |
| `src/lib/components/app-sidebar.svelte` | People entry/badge |

Each file ≤400 lines.

## Acceptance

- Unassigned non-admin staff hitting `/` or `/chat` are redirected to `/people?onboarding=1`
  once, with no loop.
- `/people` renders for them without a class/cookie/workspace.
- Toggle on → Add class visible; self-assign succeeds; cookie set; chat/filestore become
  usable on the next navigation.
- Toggle off → no self-assign control; admin instruction; direct POST 403.
- Admin/IT are never redirected and see the management surface.
- Non-staff gets 403 and is not redirected.
- All access decisions come from DB assignments, not the cookie.
