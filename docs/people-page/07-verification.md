# 07 — Verification

## 1. Spec-package checks (now)

- Every file in `docs/people-page/` and `docs/people-page-spec.md` is ≤400 lines.
- Every document in the map is linked from the index.
- Exclusions, parent contact, scope, assignments, toggle, bootstrap and performance budgets
  are explicit.
- No file under `src/`, `drizzle/` or `static/` is modified.

```bash
cd /home/beznet/Workspace/legacy-maintenance
for f in docs/people-page-spec.md docs/people-page/*.md; do
  n=$(wc -l < "$f")
  if [ "$n" -gt 400 ]; then echo "OVER: $f $n"; fi
done
```

## 2. Build-time commands

```bash
pnpm check
pnpm test:unit
pnpm build
git diff --stat -- src/lib/server/db drizzle
git status --short
```

No changes under schema/migration paths; `layout.css` untouched.

Line cap:

```bash
for f in $(find "src/routes/(chat)/people" src/lib/components/people -type f); do
  n=$(wc -l < "$f")
  if [ "$n" -gt 400 ]; then echo "OVER: $f $n"; fi
done
```

Check final line counts of touched repository files too.

## 3. Read-only DB verification

Observed baseline (one local school):

```sql
SELECT id, username, full_name, email, usertype, role_id, is_administrator
FROM users WHERE id = 1;

SELECT COUNT(*) AS total,
       SUM(user_id IS NULL) AS nulls,
       SUM(user_id = 1) AS one,
       SUM(user_id > 1) AS gt_one,
       SUM(active_status = 1) AS active
FROM sm_staffs;

SELECT COUNT(*) AS total,
       SUM(user_id IS NULL) AS nulls,
       SUM(user_id = 1) AS one,
       SUM(user_id > 1) AS gt_one,
       SUM(active_status = 1) AS active,
       SUM(guardians_email IS NULL OR guardians_email = '') AS no_email
FROM sm_parents;

SELECT academic_id, COUNT(*) AS n
FROM sm_parents GROUP BY academic_id ORDER BY n DESC;

SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT guardians_email FROM sm_parents
  WHERE guardians_email IS NOT NULL AND guardians_email <> ''
  GROUP BY guardians_email HAVING COUNT(*) > 1
) t;

SELECT (SELECT COUNT(*) FROM sm_staffs) staff,
       (SELECT COUNT(*) FROM sm_parents) parents,
       (SELECT COUNT(*) FROM sm_students) students,
       (SELECT COUNT(*) FROM sm_subjects) subjects,
       (SELECT COUNT(*) FROM sm_class_sections) class_sections,
       (SELECT COUNT(*) FROM sm_assign_subjects) assignments;

SELECT COUNT(*) AS rows_count,
       SUM(teacher_id IS NULL) AS unassigned,
       SUM(active_status = 1) AS active
FROM sm_assign_subjects;

SELECT COUNT(*) AS duplicate_groups
FROM (
  SELECT school_id, academic_id, class_id, section_id, subject_id, COUNT(*) c
  FROM sm_assign_subjects
  WHERE active_status = 1
  GROUP BY school_id, academic_id, class_id, section_id, subject_id
  HAVING c > 1
) t;

SHOW INDEX FROM sm_assign_subjects;
SELECT id, school_id, auto_approve FROM sm_general_settings;
SELECT COUNT(*) AS rows_count FROM infixedu__settings;
```

| Check | Observed (2026-11-24) | Decision |
| --- | --- | --- |
| user 1 | super-admin (`is_administrator = yes`, school 1) | linked rule |
| staff/parent user_id | mixed; `NULL`/`1` = unlinked | linked rule |
| parent years | year 1: 470; year 4: 97 (total 567) | active-year default = 97 |
| duplicate parent emails | 126 rows across the school, 9 in year 4 | badge/filter (same scope) |
| rows | 87 / 567 / 900 | scans accepted |
| subjects/class-sections | 39 / 71 | bounded options |
| assignments | 463 (463 active) | lazy offerings |
| unassigned | 1 (staff 1, `it_support`) | onboarding/redirect |
| duplicate groups | 48 | conflict panel |
| unique index | none | app invariant |
| `auto_approve` | 0 | off by default |
| `infixedu__settings` | 0 | not used |

Observed parent scope: active year 4 = **97** (97 linked, 0 unlinked, 0 no-email, 9 duplicate);
All-years = **567** (489 linked, 78 unlinked, 2 no-email, 126 duplicate). The active-year
dataset is all-linked, so the "Unlinked" KPI reads 0 until All-years is enabled — expected.

**Parent scope check:** confirm the 97 active-year parents are the intended dataset. If
historical parents are required, add an explicit “All years” filter; do not silently unfilter.

## 4. Query budget and EXPLAIN

Run `EXPLAIN` for staff list, parent list, roster and conflict queries. Record `type`, `key`,
`rows`, `Extra`. Expected: school/academic index use where available; `ALL`/`ref` scan for
`LIKE '%term%'` (no name index), bounded by school/page. Fix query shape before considering
indexes.

Measured by instrumenting the mysql2 pool (`query` + `getConnection().query`) around each
call. Every `/people` load also pays one fixed `BaseRepository.loadConfigurations` cost
(3 statements: general settings, academic years, exam types); the column below subtracts it so
the numbers are directly comparable to the spec budget.

| Operation | Max queries | Observed | Pass |
| --- | --- | --- | --- |
| Staff tab | 2 + 4 options | 6 (+3 config = 9) | yes |
| Parents tab | 2 (3–4 fallback) | 2 (+3 config = 5) | yes |
| Students tab | 3 | 1 unselected / 3 selected (+3 config = 4/6) | yes |
| Admin assignments initial | 4 | 1 settings + 1 classes + 1 subjects + 1 conflicts + 1 teachers (teachers bounded at 500) | yes |
| Offerings per class | 1 | 1 (5 rows for 13/A) | yes |
| Self-assign dialog | 3 | 1 settings + 1 eligibility + 1 classes/subjects (viewer already carries conflicts) | yes |
| Create offerings | 2 | `BEGIN`, 1 select, 1 insert, `COMMIT` | yes |
| Assign teacher | 1 + N (≤50) | `BEGIN`, 1 select (`FOR UPDATE`), 1 update, `COMMIT` | yes |
| Self-assign action | 2N (≤50) | 1 select (`FOR UPDATE`) + 1 write per subject | yes |
| Resolve conflict | 1 | 1 update | yes |
| Toggle | 1 | 1 read / 1 update | yes |

No query inside a row loop; no unbounded `IN`; `pageSize ≤100`; ids ≤50; offerings lazy.

### EXPLAIN (recorded 2026-11-24)

| Query | type | key | rows | Extra |
| --- | --- | --- | --- | --- |
| Staff rows | `s: ALL`, joins `eq_ref` | — | 87 | Using where; Using filesort |
| Staff stats | `s: ALL`, `u: eq_ref` | — | 87 | Using where |
| Staff search (`LIKE '%ada%'`) | `ALL` | — | 87 | Using where; Using filesort |
| Parent rows | `p: ref`, `u: eq_ref`, `dup: ref` | `sm_parents_academic_id_foreign`, `PRIMARY`, `key0` | 97, 1, 9 | Using where; Using filesort |
| Parent duplicate aggregate | `ref` | `sm_parents_academic_id_foreign` | 97 | Using where; temporary; filesort |
| Roster | `index_merge` on class+section | `student_records_class_id_foreign`,`…_section_id_foreign` | 17 | Using intersect(…); where; temporary; filesort |
| Conflicts | `ALL` | — | 463 | Using where; filesort |
| Offerings (one class) | `a: index_merge`, joins `eq_ref` | `…class_id_foreign`,`…section_id_foreign` | 2, 1, 1 | Using intersect(…); where; temporary; filesort |

Interpretation: the documented `LIKE '%term%'` scan is the only unbounded-by-index access
(87/567/900 rows) and is accepted per spec `10`; parents and roster use real indexes
(`academic_id`, and an `index_merge` on class+section); the conflict query is the intended
single grouped scan of the 463-row assignment table; offerings are bounded to one class.
No unexpected full-table scan beyond the documented `LIKE` and grouped-conflict scans, so no
query reshape is required and no index is added.

## 5. Unit tests

`tests/unit/people/`

- `people-format.test.ts`: linked null/1/2/no user; Gmail/non-Gmail; initials; pager;
  staff/parent validation.
- `people-params.test.ts`: defaults/fallbacks; page/size clamp; URL round-trip; class/section
  rejected outside allowed set; `<2` char query cleared; onboarding hint.
- `people-access.test.ts`: admin/IT/staff one/many/none/non-staff; cookie/URL widening;
  school-filtered admin classes; redirect decision; self-assign eligibility.
- `people-assignments.test.ts`: conflict detection; atomic self-assign mapping;
  create/reactivate/skip; replace rule; conflict resolution; `auto_approve` mapping; cookie
  payload; id caps.

Repository methods are exercised through the page/manual checks; pure SQL builders (if any)
get unit tests. Do not add a parallel query module for testability.

## 6. Manual smoke

| Viewer | Expected |
| --- | --- |
| Admin | All tabs; staff actions; parent contact; Manage assignments; toggle; conflicts; never redirected |
| IT/Admin designation | Same; never redirected |
| Teacher one class | Students only; that class |
| Teacher several classes | All subject classes |
| Unassigned, toggle on | Redirect; Add class; immediate; chat/filestore work |
| Unassigned, toggle off | Redirect; admin instruction; POST 403 |
| Unassigned on `/people` | No loop; loads without class/cookie |
| Non-staff | 403; no redirect |
| Admin/IT no class | No redirect; management works |

Per viewer: 320/375/768/1024/1440; light/dark; tabs scroll; cards; 44px; safe-area;
search debounce/URL/back; filters/sort/paging/KPIs; staff create/edit/photo/remove; parent
contact (no delete); admin step 1/2/replace; conflicts; self-assign cookie/invalidate; toggle
off; deactivate; URL/cookie tamper; one error banner; focus trap; reduced motion; network panel
shows no per-row requests or all-offerings payload.

### Manual matrix (executed 2026-11-24)

Automated blocks are live-DB reads/writes against `devdb` (temporary harnesses, removed after
each run; the database was restored to its exact baseline afterwards — 463 assignments,
`auto_approve = 0`).

| Viewer | Result |
| --- | --- |
| Admin (user 1, IT) | All 3 tabs; staff 72 active/87 total with 16/9/10/3 options; parents 97 active-year; students prompt across 27 classes → 25-row roster; never redirected |
| IT/Admin designation | Same as admin; never redirected |
| Teacher one class (staff 3) | Students only; auto-selected 13/A (Nursery 1) with 25 rows; staff/parents payloads absent |
| Teacher several classes | Policy covered by unit tests; live year 4 holds one class per teacher (multi-class only in year 1) |
| Unassigned, toggle off (staff 1) | `/`, `/chat`, `/chat/thread-1` → one 302 `/people?onboarding=1`; `/people` renders onboarding; direct self-assign POST → 403 |
| Unassigned, toggle on | Self-assign inserts atomically, second attempt 403; `selected-class` set on success |
| Unassigned on `/people` | No loop; resolves with no class/cookie (`isUnassigned: true`) |
| Non-staff (user 2) | `/people` load throws 403; never redirected |
| Admin/IT no class | No redirect; management surface works |
| Parent contact | Only guardian columns change; linked `users` row untouched; empty → NULL; invalid email / cross-school / non-manager rejected; no delete path exists (`grep` clean) |
| Student avatars | `student_photo` via `Avatar.Image`; missing dev files (854 legacy paths) fall back to initials on a deterministic 8-hue palette; roster SSR shows 50 avatar/image/fallback triples and no broken image |
| Student view/edit modal | Action menu per row; `GET /people/students/:id` returns student + genders + categories; autosave (700 ms, serialised) updates name/DOB/roll/gender/category and recomputes `full_name`; activate/deactivate updates student + record; validation 400s; teacher out-of-class 403 / in-class 200 read-only; fixture restored |
| shadcn forms | All modals/forms use `Dialog`, `Select` (via `people-select`), `Checkbox`, `Switch`, `Input`, `Label`, `Button`, `Avatar`, `DropdownMenu`; grep finds no raw `<select>`, checkbox input, `role="switch"` or `<img>` in `components/people` |
| Staff/Parents parity | Colorful `Avatar` fallbacks + vertical 3-dot menus (Staff: View / edit, Manage classes; Parents: Edit contact); SSR 50 avatars and 50 action buttons per tab |
| Mobile dialogs | Shared shell: `overflow-x-hidden`, single `overflow-y-auto`, `pt-12` below the close button, truncated select values; verified in the served modules |
| Form contrast | Labels `text-muted-foreground`, values `text-foreground`; both light and dark use the token pair |
| New student | Options endpoint 27/3/5; sibling search `LUCY` → ADM 880 + parent; sibling path linked parent 282 (no parent password); new-parent path created parent 618 + password; validation 400s, non-manager 403; fixtures removed |
| Action responses | Programmatic actions parsed with `deserialize` (`submitPeopleAction`); failures branch on `type`, not HTTP status; passwords/counts read correctly |
| Admin assignment | Create on a free tuple (`created: 1`); assign (`updated: 1`); different teacher without `replace` → 409; with `replace` → updated; idempotent → 0/1; deactivate → `active_status = 0` |
| Conflicts | Group 12/6/24: keeping one row deactivated exactly the other and left one active |
| Toggle | off → on → off, uncached, existing rows untouched |

Viewport/token/a11y items (320/375/768/1024/1440, light/dark, 44px targets, safe-area, focus
rings, reduced motion, debounce/back-button, network panel) are implemented in the source as
`min-h-11`/`sm:min-h-9`, `safe-area-bottom`, `scrollbar-hide`, `focus-visible:ring-*`,
token-only classes and `aria-busy` skeletons; they were verified by inspection plus
`pnpm check`, not by screenshot capture.

## 7. Acceptance checklist

- [x] Spec approved.
- [x] `/people` in ChatHeader + max-w-6xl shell.
- [x] Header/title/search/New; scrollable tabs/filter; KPI strip; tables/cards; pager.
- [x] Staff actions; parent contact only; students picker/roster.
- [x] Admin offerings → teacher; toggle off by default; self-assign eligible staff.
- [x] Conflicts block self-assign; panel resolves.
- [x] Redirect/bootstrap/cookie; no loop; chat unblocked.
- [x] Access matrix; 403; no cookie/URL widening.
- [x] Repository-first; no parallel query layer.
- [x] Query budgets/no N+1; lazy offerings; EXPLAIN recorded.
- [x] Tokens only; 44px; safe-area; ≤400 lines; check/test/build.
- [x] No schema diff.

## 8. Result record

- **Date:** 2026-11-24
- **`pnpm check` / `test:unit` / `build`:** check 0 errors (36 pre-existing warnings);
  people suite **71/71** across 5 files; build completes (needs an absolute `MASTRA_DB_URL`;
  with the repo's relative `file:./storage/...` the pre-existing Mastra DB open fails).
  The full `pnpm test:unit` baseline still has 30 unrelated failures (provider/potluck/
  marksheet/OCR/skills) that do not import `people/*`; see follow-ups.
- **Schema diff:** `git diff --stat -- src/lib/server/db drizzle` empty; `layout.css` untouched.
- **Line-cap:** no file under `src/routes/(chat)/people`, `src/lib/components/people`,
  `src/lib/server/people` or `src/lib/people` exceeds 400. Largest: `manage-assignments-dialog`
  400 (`student-create-dialog`), `student-detail-dialog` 325, `manage-assignments-dialog` 303,
  `people-student-actions` 270, `staff-create-dialog` 215.
  Pre-existing debt (grew, approved):
  `uploads/+server.ts` 530 → **572**, `staff.repo.ts` 401 → **524**,
  `result.repo.ts` 960 → **1008**, `student.repo.ts` 1275 → **1369**.
- **DB summary:** staff 87, parents 567 (97 active year / 470 year 1), students 900, subjects 39,
  class-sections 71, assignments 463 (463 active, 0 unassigned, 48 duplicate groups),
  `auto_approve = 0`.
- **EXPLAIN/query counts:** recorded above; all budgets met with `Promise.all` and no per-row
  queries.
- **Known deviation:** client components cannot import `$lib/server`, so the pure URL/display
  helpers live in `src/lib/people/` and are re-exported by the server modules (plan Decision
  Log). Actions are split into `people-action-context` / `people-actions` /
  `people-assignment-actions`; the bootstrap guard lives in `people-bootstrap.ts`.
- **Bug fixed during verification:** `assignOfferingTeacher`'s duplicate check interpolated
  unqualified columns, making the correlated count resolve to the inner alias and report the
  whole table; every assignment raised a false `AssignmentConflictError`. Qualified as
  `sm_assign_subjects.<col>`.
- **Follow-ups:** (1) full `pnpm test:unit` baseline is red for unrelated suites — decide
  whether the release gate expects a green baseline; (2) `auto_approve` is a compatibility
  loan — verify no legacy InfixEdu reader before release; (3) add name/email indexes only with
  schema approval (the `LIKE` scan is documented, not fixed); (4) 48 duplicate assignment
  groups need an admin pass through the conflict panel; (5) screenshot-based
  responsive/light-dark capture remains a manual QA step; (6) student detail editing and
  colored avatars were added at the product owner's request after the spec gate and override
  spec `04` #22 and the token-only avatar rule (recorded in the plan Decision Log);
  (7) `/uploads/students/*` files are absent in dev, so avatars rely on the fallback until
  photos are uploaded; (8) new-student creation and sibling linking were added after the
  spec gate (owner request), with the sibling picker as the explicit family signal and
  guardian email as the fallback; (9) `createStudentIfNotExists` is not transactional.
