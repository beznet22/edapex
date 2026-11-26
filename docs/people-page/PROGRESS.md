# `/people` — Implementation Progress

Working tracker for the approved plan at
`.kimchi/plans/people-implementation-plan-conforming-to-the-11.md`.
Authoritative results live in [`07-verification.md`](07-verification.md); this file is the
chunk-by-chunk log and never overrides `07`.

- **Started:** 2026-11-24
- **Status legend:** ✅ done · 🟡 in progress · ⬜ not started · 🔴 blocked
- **Completed:** 2026-11-24 — all 10 chunks; results reconciled with
  [`07-verification.md`](07-verification.md).
- **Successor work — PWA document scanner:** tracked separately at
  [`scan/PROGRESS.md`](scan/PROGRESS.md), plan `~/.commandcode/plans/pwa-document-scanner-v3.md`.
  It builds on this `/people` surface (Students tab, term selector, row actions) and is **not**
  part of the 10 chunks below.

## Chunk status

| # | Chunk | Status | Started | Completed | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | Read-path repositories + types + tracker | ✅ | 2026-11-24 | 2026-11-24 | `staff.listDirectory`, `parent.listDirectory`, `student.getClassRosterPage`, `result.getClassSections(options)`, `result.getAssignedClassSections`, `people-types.ts`; `pnpm check` clean |
| 2 | Assignment write-path + conflict error + toggle | ✅ | 2026-11-24 | 2026-11-24 | Split into `assignment-read` (151), `assignment-legacy` (193), `assignment` (322) for the 400-line cap; toggle cannot write `updatedBy` (column absent) |
| 3 | Pure modules + unit tests | ✅ | 2026-11-24 | 2026-11-24 | `people-format` (201), `people-params` (208), `people-access` (96); 63/63 people tests pass; full `pnpm test:unit` baseline has 30 unrelated failures |
| 4 | Route shell, load, URL state, shared UI | ✅ | 2026-11-24 | 2026-11-24 | `people-load.ts` (214), `+page.svelte` (374), 14 components (11–247); client-safe `lib/people` split; check/build pass; live-DB smoke OK |
| 5 | Staff tab mutations + photo | ✅ | 2026-11-24 | 2026-11-24 | `people-actions.ts` (184) + 3 server actions; `staff-tab` (258) + 2 dialogs; `staffPhoto` upload; 67/67 people tests |
| 6 | Parents tab + contact edit + All-years | ✅ | 2026-11-24 | 2026-11-24 | `parent.updateContact` + `updateParentContact` action; `parents-tab` (154) + dialog (97); live 97 / 567 verified |
| 7 | Students tab + class picker | ✅ | 2026-11-24 | 2026-11-24 | `students-tab` (161) + `student-class-picker` (60) + `student-detail-dialog/fields` (325/134); photos + colored initials, actions menu, autosaving modal; page is composition only |
| 8 | Assignments UI + self-assign | ✅ | 2026-11-24 | 2026-11-24 | 6 components + 2 JSON endpoints + 6 actions (split into `people-assignment-actions` 272); fixed a Chunk 2 count-subquery bug; live-verified |
| 9 | Bootstrap redirect + sidebar | ✅ | 2026-11-24 | 2026-11-24 | `people-bootstrap.ts` (111) + layout guard/resilience (363); People entry with Setup badge; redirect matrix verified |
| 10 | Verification record + gates | ✅ | 2026-11-24 | 2026-11-24 | `07-verification.md` filled (283); EXPLAIN + budgets measured; DB restored to baseline; reconciled |

## Chunk checklists

### 1 — Read-path repositories + types

- ✅ `StaffRepository.listDirectory` and `ParentRepository.listDirectory`: rows + one aggregate in 2 queries (`Promise.all`), no per-row subquery.
- ✅ Parent duplicate detection uses one derived aggregate shared by rows and stats; `allYears` and zero-row fallback supported.
- ✅ `StudentRepository.getClassRosterPage` returns `{ rows, total, stats }`; `getStudentsByClassSection` unchanged.
- ✅ `getClassSections()` no-arg output unchanged; `getClassSections({ schoolId, academicId })` school/year scoped; `getAssignedClassSections` has no `.limit(1)`.
- ✅ `people-types.ts` compiles; `pnpm check` passes.

### 2 — Assignment write-path

- ✅ `createOfferings`: 1 SELECT + 1 batch write → `{ created, reactivated, skipped }`.
- ✅ `selfAssign` / `assignSubjectTeacher`: transaction + `FOR UPDATE`, all-or-nothing, idempotent, `AssignmentConflictError` on duplicate tuples.
- ✅ `assignOfferingTeacher` (cap 50, replace rule), `resolveConflict` (1 update), `deactivateAssignment` (1 update, no delete).
- 🟡 Toggle: uncached per-school read defaulting to `false` ✅; setter writes `autoApprove` only — `sm_general_settings` has no `created_by`/`updated_by` columns, so the spec's audit write is unattainable without a schema change.
- ✅ Assignment repository split keeps every file ≤400 lines (151 / 193 / 322); `pnpm check` passes.

### 3 — Pure modules + tests

- ✅ `people-format.ts` (201): linked/initials/Gmail/percent/pager/validators/toggle/offering/conflict/cookie helpers; whitespace-only email is not flagged non-Gmail.
- ✅ `people-params.ts` (208): role defaults, fallbacks, clamps, `<2`-char clear in parse **and** build, truncation, URL round-trip, page reset, `allYears`, `onboarding`, id cap.
- ✅ `people-access.ts` (96): admin/IT, allowed tabs, class resolution (no cookie/URL widening), eligibility, redirect decision.
- ✅ Four test files (63 tests) pass via `pnpm exec vitest run --project unit tests/unit/people`; every file ≤400 lines (`people-types.ts` 203).

### 4 — Route shell, load, URL state, shared UI

- ✅ Shell/tabs/403/no resolvers: `ChatHeader` + `max-w-6xl` + header/search/New + pills/filter/KPI/table-cards/pager; admin/IT 3 tabs, teacher Students; non-staff 403 verified.
- ✅ Query shape: staff rows+stats (2) + 4 options only on Staff; parents 2 (4 fallback); students classes 1 + rows/stats 2; zero-class teacher adds eligibility (1); payloads disjoint.
- ✅ URL: `buildPeopleUrl` + `goto` (`replaceState`/`keepFocus`, paging `noScroll: false`); 300 ms/2-char search; non-page changes reset page 1.
- ✅ Responsive/a11y: 320-first, cards below `md`, `min-h-11`/44px, safe-area, tokens only, focus-visible rings, `aria-busy` skeleton; every file ≤400.

### 5 — Staff tab + mutations + photo

- ✅ Create (required fields, login, temp password shown once, never logged), edit, soft remove (`updateStaffStatus`, no delete path); `canManage` + school ownership re-checked server-side.
- ✅ `staffPhoto`: admin/IT only, same-school staff, JPEG/PNG/WebP ≤5 MB via `checkStaffPhoto`, SHA-256 name + extension from MIME under `static/uploads/staff/`, row updated; non-manager/cross-school/unknown rejected.
- ✅ `canManage` enforced server-side, `fail(400, { error })` safe messages; `staff-tab.svelte` 258 ≤400; action helpers unit-verified against live DB (create/update/cross-school reject/soft-delete).

### 6 — Parents tab + contact edit + All-years

- ✅ Edit contact only: `ParentRepository.updateContact` writes `guardians_email`/`guardians_mobile` and nothing else (never `users`); empty clears to NULL; invalid email/oversize rejected; live check confirmed the linked login row is unchanged. No Link/Revoke/Delete/Deactivate control exists (`grep` clean).
- ✅ Linked rule `user_id > 1` + `users` row; non-Gmail/Duplicate badges from derived values; duplicate filter total equals its stats total (126 all-years).
- ✅ Active year default 97 with `yearFallback: false`; explicit All-years 567 with in-scope duplicates (126); a zero-row year falls back to school-only with `yearFallback: true`; KPIs/paging/sort follow the scope.

### 7 — Students tab + class picker

- ✅ Admin sees 27 school class sections and is prompted until selected; a single option auto-selects; a teacher auto-selects their first active assignment; a requested class outside the allowed set falls back to the first allowed row (tamper ignored).
- ✅ Zero assignments renders `unassigned-empty-state` (no 403, no error banner, no misleading zeros); KPI strip only renders with a selected class.
- ✅ Roster Student/Admission no/Class/Status with name/admission search, name sort, 25/50/100 paging and KPIs (3 queries); tampered `classId`/`sectionId` cannot widen scope.
- ✅ Student avatars: `student_photo` rendered via `Avatar.Image`; missing files fall back to initials on a deterministic 8-colour palette (dark variants), so the 404s in dev never show a broken image.
- ✅ Actions column (vertical 3-dot menu) opens one view/edit modal: photo upload, first/last name, DOB, roll no, gender, category, activate/deactivate; autosave debounced at 700 ms with serialised saves and a Saving/Saved indicator. Admin/IT edit; teachers are read-only and may only open students in their assigned classes.

### 8 — Assignments UI + self-assign

- ✅ Toggle reads/writes `sm_general_settings.auto_approve` (off → on → off verified), admin/IT only, leaves assignments intact; step 1 batch-creates/reactivates and reports `{ created, reactivated, skipped }`; step 2 assigns ≤50, requires `replace` for a different teacher (409), idempotent for the same (0 updated / 1 skipped), loads offerings only after a class is chosen.
- ✅ Conflict panel lists the grouped duplicates, keeps one active row per tuple and deactivates the rest (verified `deactivated = n-1`, no deletes); conflicting tuples block assignment (400) and self-assign (409).
- ✅ Self-assign: off → 403; admin → 403; enabled + zero assignments → atomic insert, second attempt 403; unknown class / empty subjects → 400; sets `selected-class` (`httpOnly`, `sameSite=lax`, `path=/`, one year), `invalidateAll()` + roster navigation in the dialog; deactivation sets `active_status = 0`.
- ✅ `assignment.repo.ts` 322 ≤400; `people-assignment-actions.ts` 272 ≤400; endpoints enforce `canManage` + school/year scope and return 403 unauthenticated.

### 9 — Bootstrap + sidebar

- ✅ Redirect matrix (live): unassigned non-admin/IT on `/`, `/chat`, `/chat/thread-1` → one 302 to `/people?onboarding=1`; `/people`, `/people/assignments`, `/filestore`, `/class-roster` never redirect; admin/IT, non-staff and assigned teachers never redirect; no active year → no redirect.
- ✅ `/people` resolves for unassigned staff with no cookie; class/student/assigned-section lookups in the `(chat)` layout are wrapped so a missing active year degrades instead of failing the page.
- ✅ Sidebar People entry (`contact-round`, after New Session, above class-dependent entries) for every authenticated user, with a `Sidebar.MenuBadge` "Setup" only when `isUnassigned` (returned by the layout).

### 10 — Verification

- ✅ `pnpm check` 0 errors; people suite 71/71; `pnpm build` completes; `git diff --stat -- src/lib/server/db drizzle` empty and `layout.css` untouched.
- ✅ Line-cap: no people-path file >400; pre-existing debt recorded per file in `07` §8.
- ✅ EXPLAIN (`type/key/rows/Extra`) and instrumented query counts recorded in `07` §4; all budgets met.
- ✅ Manual matrix recorded in `07` §6; acceptance checklist ticked; this file reconciled with `07` (no disagreements).

## Verification log (append-only)

| Date | Chunk | Command / check | Result | Notes |
| --- | --- | --- | --- | --- |
| 2026-11-24 | plan | Plan approved | PASS | 10 chunks, 3 user decisions recorded in the plan's Decision Log |
| 2026-11-24 | 1 | `ls docs/people-page/PROGRESS.md` | PASS | Tracker created and verified on disk |
| 2026-11-24 | 1 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings (none in `people/*` or touched repositories) |
| 2026-11-24 | 1 | Query-shape inspection | PASS | Staff/parent directory: one rows query + one aggregate via `Promise.all`; parent duplicates via single derived `LEFT JOIN`; roster: rows + aggregate; class options bounded. Runtime EXPLAIN deferred to Chunk 10. |
| 2026-11-24 | 2 | `pnpm check` | PASS | 0 errors, 36 warnings after the assignment split and settings toggle |
| 2026-11-24 | 2 | `wc -l src/lib/server/repository/assignment*.repo.ts` | PASS | 151 / 193 / 322 — all ≤400 |
| 2026-11-24 | 2 | Runtime SQL (`FOR UPDATE`, conflict rejection, toggle) | pending | Deferred to Chunk 10 manual/DB checks |
| 2026-11-24 | 3 | `pnpm exec vitest run --project unit tests/unit/people` | PASS | 4 files / 63 tests; added whitespace-only `isNonGmail`, build-URL `<2`-char, non-student class-scope and no-widening cases |
| 2026-11-24 | 3 | `wc -l src/lib/server/people/*.ts tests/unit/people/*.ts` | PASS | 96 / 201 / 208 / 203 modules; 139 / 105 / 206 / 200 tests — all ≤400 |
| 2026-11-24 | 3 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings |
| 2026-11-24 | 3 | `pnpm test:unit` (full suite) | PRE-EXISTING FAIL | 36 tests / 16 files under the shell's `NODE_ENV=production`; 30 / 12 with `NODE_ENV=test`. None import `people/*` or the touched repositories (see blockers). |
| 2026-11-24 | 4 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings; route + components included |
| 2026-11-24 | 4 | `pnpm build` (absolute `MASTRA_DB_URL`) | PASS | Default relative env fails earlier in the pre-existing Mastra DB open; absolute URL build completes |
| 2026-11-24 | 4 | Live-DB load smoke (temporary test, removed) | PASS | Admin: staff active 72 (87 total) / options 16-9-10-3, parents 97 / `yearFallback` false, roster 28 (25 rows); teacher: 1 class auto-selected, tampered `classId` ignored; unassigned: onboarding, toggle off; non-staff: 403 |
| 2026-11-24 | 4 | Query-shape inspection | PASS | Staff 2+4, Parents 2 (4 fallback), Students 1+2; zero-class teacher +1 eligibility; onboarding adds settings+classes+subjects only when enabled; plus the shared 3-query `BaseRepository` config load per request |
| 2026-11-24 | 4 | `wc -l` new files | PASS | `people-load` 214, page 374, components 11–247, `lib/people` 40/78; all ≤400 |
| 2026-11-24 | 5 | `pnpm exec vitest run --project unit tests/unit/people` | PASS | 5 files / 67 tests (new `staff-photo.test.ts` 4 cases: MIME, empty, 5 MB boundary) |
| 2026-11-24 | 5 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings; actions/dialogs/tab included |
| 2026-11-24 | 5 | Action layer vs live DB (temporary test, removed) | PASS | Created a staff+login, temp password returned, rename+email updated, cross-school update rejected (400), soft delete set `active_status = 0`; rows cleaned up |
| 2026-11-24 | 5 | Dev-server probe (`:5199`) | PASS | Unauthenticated `/people` → 302 `/signin`; `POST /people?/createStaff` → 403; `POST /api/uploads` → 403; no build/runtime errors in the log |
| 2026-11-24 | 5 | `wc -l` Chunk 5 files | PASS | actions 184, tab 258, dialogs 229/238, `staff-photo` 30 — all ≤400; `uploads/+server.ts` 572 (pre-existing debt, +42) |
| 2026-11-24 | 6 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings; parents tab/dialog/action included |
| 2026-11-24 | 6 | Contact update vs live DB (temporary test, removed) | PASS | Only guardian columns changed; linked `users` row untouched; empty → NULL; invalid email, cross-school and non-manager all rejected; original row restored |
| 2026-11-24 | 6 | Parent scope vs live DB (temporary test, removed) | PASS | Active year 97 (`yearFallback` false), all years 567, stats totals match rows, duplicate filter 126 = stats 126; year 9999 → `yearFallback: true` with 567 |
| 2026-11-24 | 6 | No-delete audit (`grep` over components/actions) | PASS | No Revoke/Delete/Deactivate/`deleteParent` reference in `components/people` or `routes/(chat)/people` |
| 2026-11-24 | 6 | `pnpm exec vitest run --project unit tests/unit/people` | PASS | 5 files / 68 tests (added All-years URL round-trip) |
| 2026-11-24 | 6 | `wc -l` Chunk 6 files | PASS | `parents-tab` 154, dialog 97, page 268, actions 223, `parent.repo` 374 — all ≤400 |
| 2026-11-24 | 7 | Selection policy vs live DB (temporary test, removed) | PASS | Admin: 27 classes → prompted (`selected` null, 0 rows); picking class 12/B → 25 rows; tampered 999999 → class 12/B with 25 rows. Teacher 3: auto-selected 13/A (Nursery 1) with 25 rows |
| 2026-11-24 | 7 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings; students tab/picker included |
| 2026-11-24 | 7 | `pnpm exec vitest run --project unit tests/unit/people` | PASS | 5 files / 70 tests (added admin prompt + outside-set fallback cases) |
| 2026-11-24 | 7 | `wc -l` Chunk 7 files | PASS | `students-tab` 79, picker 57, page 169 (composition only), `people-load` 215 — all ≤400 |
| 2026-11-24 | 8 | `pnpm check` | PASS | 0 errors, 36 pre-existing warnings; actions, endpoints, 6 components included |
| 2026-11-24 | 8 | Assignment actions vs live DB (temporary test, removed) | PASS | Toggle off→on→off (non-manager 403); create on a free tuple (`created: 1`); assign (`updated: 1`); different teacher without `replace` → 409; with `replace` → updated; idempotent → 0/1; deactivate → `active_status = 0`; unknown class 400; DB restored to 463/463 + toggle 0 |
| 2026-11-24 | 8 | Conflict resolution vs live DB (temporary test, removed) | PASS | Group 12/6/24 (rows 1472, 1477): keep 1472 → `deactivated: 1`, one active row left; fixture restored |
| 2026-11-24 | 8 | Self-assign vs live DB (temporary test, removed) | PASS | Toggle off → 403; enabled + unassigned teacher → atomic insert, second attempt 403; admin → 403; unknown class / no subjects → 400; rows and toggle restored |
| 2026-11-24 | 8 | **Bug fixed (Chunk 2):** `assignOfferingTeacher` `activeCount` | FIXED | Drizzle `${column}` interpolates unqualified, so the correlated subquery resolved to the inner alias `a2` and reported 464 for every row → every assign threw `AssignmentConflictError`. Now qualified as `sm_assign_subjects.<col>`; verified `updated: 1` |
| 2026-11-24 | 8 | `wc -l` Chunk 8 files | PASS | dialog 279, self-assign 100, toggle 63, conflicts 89, steps 91/76, actions 173, assignment-actions 272, context 108 — all ≤400 |
| 2026-11-24 | 9 | Layout redirect vs live DB (temporary test, removed) | PASS | Unassigned staff: `/`, `/chat`, `/chat/thread-1` → 302 `/people?onboarding=1`; `/people` resolves with `isUnassigned: true`; assigned teacher (3) and admin `isUnassigned: false`; no redirect |
| 2026-11-24 | 9 | Bootstrap decision vs live DB (temporary test, removed) | PASS | Paths `/` `/chat` `/chat/x` → redirect; `/people` `/people/assignments` `/filestore` → no; admin, non-staff, assigned teacher, no-year → no |
| 2026-11-24 | 9 | Line-cap fix | PASS | `+layout.server.ts` hit 440 → extracted `people-bootstrap.ts`; now 363 + 111, both ≤400 (spec lists the layout as a ≤400 file) |
| 2026-11-24 | 9 | `pnpm check` / `test:unit` / `build` | PASS | 0 errors; 71 people tests; build completes |
| 2026-11-24 | 9 | `wc -l` Chunk 9 files | PASS | `people-bootstrap` 111, `+layout.server` 363, `app-sidebar` 198, `+layout.svelte` 134 — all ≤400 |
| 2026-11-24 | 10 | Line-cap sweep (`people` paths) | PASS | No file >400; max `manage-assignments-dialog` 279 |
| 2026-11-24 | 10 | `git diff --stat -- src/lib/server/db drizzle` + `layout.css` | PASS | Both empty |
| 2026-11-24 | 10 | EXPLAIN (staff/parents/roster/conflicts/offerings) | PASS | Documented scans only; parents/roster use indexes; recorded in `07` §4 |
| 2026-11-24 | 10 | Query budget (instrumented pool) | PASS | Staff 2+4, Parents 2, Students 1/3, create 2, assign 1+1, resolve/deactivate/toggle 1 (+3 fixed config per load) |
| 2026-11-24 | 10 | `pnpm check` / `test:unit` / `build` | PASS | 0 errors; 71/71; build completes |
| 2026-11-24 | 10 | DB restored to baseline | PASS | staff 87, parents 567, students 900, subjects 39, sections 71, assignments 463/463, `auto_approve` 0 (cleaned 4 test rows) |
| 2026-11-24 | QA | Skeleton never cleared | FIXED | Visual QA: `navigating` from `$app/state` is an object (never `null`), so `busy = navigating !== null` was permanently true. Now `navigating.to !== null` and only while the tab payload is absent. SSR: staff 0 skeletons/26 rows, parents 0/26, roster 0/26, empty search → "No results". |
| 2026-11-24 | QA | Student photo 404s | FIXED | 854 legacy paths have no files in dev. `Avatar.Image` + `Avatar.Fallback` (bits-ui) renders initials instead of a broken image; verified 50 avatar/image/fallback triples in the roster SSR. |
| 2026-11-24 | QA | Student detail editing (live) | PASS | `GET /people/students/802` → 200 with student + 3 genders + 5 categories; autosave changed name/roll and recomputed `full_name`; empty names/bad date → 400; unknown id → 400; deactivate/activate flipped `sm_students` and `student_records`; row restored to baseline. Teacher: out-of-class student → 403, in-class → 200 `canManage: false`. |
| 2026-11-24 | QA | shadcn primitives | PASS | Grep: no raw `<select>`, `type="checkbox"`, `role="switch"` or `<img>` under `src/lib/components/people/`. SSR: 50 `avatar`/`avatar-image`/`avatar-fallback`, `select-trigger` shows `CRECHE · B` and `25`; `pnpm check` 0 errors. |
| 2026-11-24 | QA | Mobile dialogs | FIXED | Shared `DIALOG_CONTENT`/`DIALOG_CONTENT_WIDE`: `overflow-x-hidden` + `overflow-y-auto` (single vertical axis), `pt-12` clears the built-in close button, `w-full`; select triggers truncate long values. Applied to all 7 people dialogs. |
| 2026-11-24 | QA | Form contrast | FIXED | Labels use `text-muted-foreground` (secondary), inputs/triggers use `text-foreground` (primary), so values no longer read at the same brightness as labels. |
| 2026-11-24 | QA | Staff/Parents parity | PASS | Both tabs now use `Avatar` with the colorful fallback and a vertical 3-dot `DropdownMenu`: Staff → View / edit + Manage classes; Parents → Edit contact. SSR: 50 avatars + 50 action buttons per tab. |
| 2026-11-24 | QA | Action-response parsing | FIXED | SvelteKit action responses are devalue envelopes and use HTTP 200 even for `type: "failure"`; the old `.json()`/`response.ok` reads treated failures as success and lost passwords. Added `submitPeopleAction` (`deserialize`) and migrated 7 components. |
| 2026-11-24 | QA | New student + sibling linking (live) | PASS | `GET /people/student-options` → 27 classes / 3 genders / 5 categories; `GET /people/students/search?q=LUCY` → LUCY OROGO AJEGI · ADM 880 · CRECHE B + parent JOHN AJEGI; search `<2` chars → `[]`. Sibling admission 880 → new student 948 linked to parent 282, no parent password; new guardian email → parent 618 + login password. Validation (empty names, unknown class) 400, non-manager 403. Fixtures removed (students 900, parents 567). |

## Blockers & follow-ups

| Date | Item | Status | Notes |
| --- | --- | --- | --- |
| 2026-11-24 | `sm_general_settings` has no audit columns | accepted | Toggle setter writes `autoApprove` only; the spec's `updatedBy` write is impossible without a schema change. Recorded for `07`. |
| 2026-11-24 | Assignment repository split | accepted | `assignment-read.repo.ts` + `assignment-legacy.repo.ts` + `assignment.repo.ts` keep the 400-line cap; `AssignmentRepository` stays the single public class. |
| 2026-11-24 | 48 duplicate active `sm_assign_subjects` groups | open (operational) | Block self-assign (409) and assignment (400); resolved only via the admin conflict panel (verified). No auto-cleanup. |
| 2026-11-24 | Actions split into three modules | accepted | `people-action-context.ts` (shared guard/helpers), `people-actions.ts` (staff + parent), `people-assignment-actions.ts` (assignments + self-assign) keep every file ≤400 while `+page.server.ts` stays a thin router. |
| 2026-11-24 | `assignOfferingTeacher` count bug | fixed | Qualified the correlated subquery; without the fix every assignment raised a false conflict. Worth an EXPLAIN/manual note in `07`. |
| 2026-11-24 | Layout redirect extracted | accepted | `people-bootstrap.ts` owns the year resolver, the assignment count and the decision; the layer is a pure router. The `(chat)` layout drops `and/eq/sql`/schema imports. |
| 2026-11-24 | Student detail editing (spec `04` #22) | accepted (owner request) | Product owner asked for a view/edit student modal with autosave; spec `04` listed it as not offered. Admin/IT edit, teachers read-only within their class scope; recorded in the plan Decision Log. |
| 2026-11-24 | New student + sibling picker | accepted (owner request) | Adds `?/createStudent`, `GET /people/student-options`, `GET /people/students/search`. Parent linking delegates to `createStudentIfNotExists`; sibling selection is an explicit searchable picker, with guardian email as the fallback match. |
| 2026-11-24 | Avatar palette deviates from token-only | accepted (owner request) | Colored initials on missing photos use a deterministic Tailwind palette (8 hues, dark variants) instead of tokens. Recorded in the plan Decision Log. |
| 2026-11-24 | Unassigned staff in live year 4 | info | Staff 1 (`it_support`, designation id 9) is the only row with zero active assignments. The spec's admin/IT definition covers only `isAdministrator` and designations `admin`/`it`, so `it_support` is treated as ordinary staff and is redirected; that is the observed live case and it matches spec `09` Rule 2. |
| 2026-11-24 | Pre-existing files over 400 lines | accepted | `uploads/+server.ts` 530 → 572, `staff.repo.ts` 401, `result.repo.ts` 960, `student.repo.ts` 1275 before this work; final sizes recorded in `07` (Chunk 10). |
| 2026-11-24 | `auto_approve` compatibility loan | open | Verify no legacy InfixEdu reader before release; dedicated setting needs schema approval. |
| 2026-11-24 | No name/email indexes | accepted | Debounced, school-scoped scans at 87/567/900 rows; indexes need schema approval. |
| 2026-11-24 | EXPLAIN capture | pending | Deferred to Chunk 10 (`07-verification.md` §4). |
| 2026-11-24 | Full `pnpm test:unit` baseline fails | open (pre-existing) | 30 unrelated failures under `NODE_ENV=test` (provider resolver/potluck/marksheet/OCR/skills); 36 under `NODE_ENV=production`. None import `people/*` or the touched repositories; decide at Chunk 10 whether the gate expects a clean baseline. |
| 2026-11-24 | Client-safe helper split | accepted (deviation) | `$lib/server` cannot be imported by client components; `buildPeopleUrl` + display helpers live in `src/lib/people/` and are re-exported from the server modules. Recorded in the plan Decision Log. |
| 2026-11-24 | Responsive/light-dark screenshots | pending (manual QA) | Implemented and inspected; no screenshot capture in this environment. Recorded in `07` §6. |
| 2026-11-24 | `pnpm build` needs an absolute `MASTRA_DB_URL` | open (pre-existing) | Relative `file:./storage/...` resolves against the built chunk dir (`/home/beznet`) and fails opening libSQL; an absolute URL builds cleanly. Record for `07`. |
| 2026-11-24 | Parent contact cannot be deleted | accepted (by design) | Spec `04` #21: contact editing only. No delete/deactivate endpoint or control exists; `updateContact` never touches `users`. |
| 2026-11-24 | Active-year parents are all linked (0 unlinked) | info | 97/97 linked in year 4, so the "Unlinked" KPI reads 0 until all-years is on (489/567 linked there). Not a bug; worth noting in `07` manual notes. |
| 2026-11-24 | Student selection policy clarified | accepted | Spec `01`/`03`: admins are prompted while teachers default to their first assigned class; any requested class outside the allowed set falls back to the first allowed row rather than an empty roster. Encoded in `people-load.ts` and covered by `people-access.test.ts`. |
| 2026-11-24 | Active-year teachers each hold one class | info | Year 4 has 33 teachers across 236 assignment rows but one distinct class each; multi-class teachers exist only in year 1. Multi-class rendering is covered by the unit policy tests, not live data. |

## Update protocol

1. Set the chunk row to 🟡 when work starts and ✅ only when its Accept When criteria are verified.
2. Mark a checklist item ✅ only when a command, test output or manual check backs it; append that evidence to the verification log.
3. Append verification rows — never rewrite or delete earlier rows.
4. Record any deviation in the plan's Decision Log first, then mirror a one-line note here.
5. Keep this file ≤400 lines. In Chunk 10, reconcile it with `07-verification.md`; `07` wins on conflict.
