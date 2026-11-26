# 04 — Exclusions (Unsupported Source Features)

Decision: **omit unsupported source features and document why; no substitutes.** Each item
depends on schema that does not exist in legacy. Adding it would require a new table or
column, which is prohibited. The page must not pretend these features exist.

Legacy-specific **assignment management** (two-step class subjects + teacher, self-assign) and
the **unassigned bootstrap** (redirect + reachable onboarding) are additions, not source
features; see `08-assignments.md` and `09-unassigned-bootstrap.md`.

## Exclusion matrix

| # | Source feature | Source behaviour | Missing schema / mechanism | `/people` behaviour |
| --- | --- | --- | --- | --- |
| 1 | Per-person claim links | 72h URL token for staff/parent | No claim-link table | Not offered |
| 2 | Claim-link modal | Show URL once, copy, countdown | Same | Not rendered |
| 3 | Revoke link | Mark link revoked | No link table | Not offered |
| 4 | Bulk request links | Sequential minting | Depends on #1 + selection | Not offered |
| 5 | Claim status | pending/claimed/flagged | No claim-status column | Derived Linked/Unlinked |
| 6 | Flagged state | Highlight/count | No flag column | Not shown |
| 7 | Google identity marker | `linkedGoogle` | No provider id | Not shown |
| 8 | Email verified timestamp | `emailVerifiedAt` | No column | Not shown |
| 9 | Link status/expiry | none/active/expired/used/revoked | No link table | Column omitted |
| 10 | Duplicates tab | Groups, sessions/providers/last login | No provider/last-login/flag/merge | **Tab omitted** |
| 11 | Duplicate flag action | Mark one account | No flag column | Not offered |
| 12 | Merge accounts | Keep one, delete others | No merge mapping; unsafe cascade | Not offered |
| 13 | Move email | Reassign between accounts | No supported action | Not offered |
| 14 | Duplicate CSV export | Download report | Depends on omitted tab | Not offered |
| 15 | Add student | Inert source button | No student-create flow | Button omitted |
| 16 | Row "Link" action | Disabled reasons + claim modal | Depends on #1 | Staff: Edit/Remove/Manage classes |
| 17 | Grid/List toggle | Grid vs list | Data is tabular | Not rendered |
| 18 | Row selection + bulk bar | Checkboxes + request links | No supported bulk action | Not rendered |
| 19 | Cursor keyset paging | Cursor replay | Replaced by offset paging | 25/50/100 |
| 20 | Issues API | Unused by the page | Not part of the surface | Not used |
| 21 | **Parent delete/deactivate** | Not a standalone source action | User prohibited deletion | No Delete/Deactivate; contact edit only |
| 22 | Student detail/guardian editing | API only | Not part of the page | Not offered |

Parent **contact editing is supported**: `guardians_email` and `guardians_mobile` can be
updated. Only deletion/deactivation is excluded.

## Assignment & bootstrap additions (not exclusions)

Deliberately added beyond the source page, using existing tables:

- Admin: create class-subject offerings (multi-select), then assign a teacher.
- Admin: toggle self-assignment via existing `sm_general_settings.auto_approve`.
- Teacher: self-assign when enabled, with zero active assignments, catalog subjects only;
  immediate access; sets `selected-class`.
- Admin: conflict panel for duplicate active offerings (48 live groups).
- Bootstrap: redirect unassigned non-admin/IT staff from `/` and `/chat` to `/people`;
  `/people` loads without a class/workspace.

These are not claim links and do not create a self-service account flow.

## What stays visible

- Staff create, edit, photo, soft remove, search/filter/sort/paging/KPIs.
- Staff “Manage classes” (admin assignment).
- Parents search/filter/sort/paging/KPIs, **Edit contact** (no Delete).
- `non-Gmail` + `Duplicate` badges; Account Linked/Unlinked.
- Students class picker (admin all school classes, teacher subject-assigned), roster,
  search/sort/paging/KPIs.
- Self-assign for eligible staff when the toggle is on.
- Admin assignment dialog, conflict panel, toggle.
- Unassigned onboarding empty state and redirect.
- “Include removed people” for staff.
- Error banner, skeletons, empty states, percentages.

## Vocabulary mapping

| Source label | `/people` label | Why |
| --- | --- | --- |
| Claimed | Linked | No claim concept; a `users` row exists or not |
| Unclaimed | Unlinked | Same |
| Flagged | — | No flag column |
| No account | No account | Same |
| My class | Class roster | Teacher view |
| People | People | Admin/IT view |
| — | Offering | Class-subject row without a teacher |
| — | Assignment | Offering plus `teacher_id` |
| — | Onboarding | Unassigned staff bootstrap on `/people` |

## Rationale for refusing substitutes

- `parent_auth_codes` is a class-level Telegram code, not a person-level claim link.
- `user_otp_codes` is an OTP, not a URL; no revocation/one-time display.
- `users.access_status`/`random_code` as a “flag” would corrupt unrelated behavior.
- A read-only Duplicates tab was offered and declined; the badge remains.
- Parent deletion is intentionally absent; contact editing covers the need.
- Assignment/bootstrap are explicit and audited, not disguised claim links.

## UI copy requirement

Do not show disabled controls for omitted features. Show only supported controls plus the
explicit assignment/bootstrap additions. The exclusion matrix records the reasoning.
