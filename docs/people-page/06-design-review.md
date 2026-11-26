# 06 — Design Review

Scope: filestore layout, tokens, class scoping, assignment data, bootstrap, and query
performance. Evidence from `layout.css`, `filestore/+page.svelte`, `helpers/class-scope.ts`,
`repository/*`, `class-selector.svelte`, `ChatComposer`, `SharedChatView`, and read-only DB
checks. Fixes apply to `/people`; global changes are deferred.

## Token inventory (light)

| Token | Value | Used for |
| --- | --- | --- |
| `--background` | `oklch(0.99 0.005 90)` | Canvas |
| `--card` | `oklch(1 0 0)` | Cards, tables |
| `--foreground` | `oklch(0.25 0.02 90)` | Text |
| `--muted-foreground` | `oklch(0.55 0.02 90)` | Secondary text |
| `--primary` | `oklch(0.60 0.14 40)` | CTAs, pills, ring |
| `--primary-foreground` | `oklch(1 0 0)` | Text on primary |
| `--border` | `oklch(0.92 0.01 90)` | Hairlines |
| `--input` | `oklch(0.94 0.01 90)` | Inputs |
| `--accent` | `oklch(0.96 0.01 90)` | Empty tint |
| `--destructive` | `oklch(0.55 0.20 25)` | Errors |

Dark: background 0.14, card 0.18, border 0.25/50%, primary 0.65.

## Visual findings

1. **Border/input separation low (medium):** border 0.92/input 0.94 vs background 0.99/card
   1.0. Fix: inputs `bg-muted/60`; tables `bg-card`; bands `bg-muted/40`.
2. **Primary contrast unverified (high risk):** white on primary at OKLCH L 0.60. Verify with
   a checker; short labels only. Global token fix deferred.
3. **Destructive pairing (medium):** same value both modes; verify text/fill. Use
   `bg-destructive/10 text-destructive`; split ink token if needed.
4. **Empty tint invisible (medium):** `bg-accent/10` with 0.96 on 0.99. Use
   `bg-muted/50 border-border`; onboarding uses a solid card.
5. **Arbitrary values/non-token radii (medium):** `text-[10px]`, `rounded-3xl`,
   `bg-accent/10`, raw shadows. Use `text-xs`, `rounded-lg/xl`, `bg-muted/50`, `shadow-sm`.
6. **Touch targets <44px (high PWA):** `h-9`/`h-10`. Use `min-h-11` mobile; `sm:min-h-9/10`.
7. **Tab strip clips (high):** six pills, no scroll, root hides overflow. Use
   `overflow-x-auto scrollbar-hide`, `shrink-0`.
8. **10px labels (medium):** use `text-xs` minimum; `text-sm` body.
9. **Safe-area unused (medium):** apply `safe-area-bottom`.
10. **Duplicate font block (low):** keep one declaration.
11. **Landscape hides sidebar (medium):** collapsed rail/floating trigger.
12. **No global focus-visible (high):** every control gets ring on `focus-visible`.
13. **Overflow hidden masks bugs (low):** test from 320px.
14. **Raw shadows/glows (low):** `shadow-sm/md` only.
15. **Reduced motion/scrollbars fine.**

## Scoping findings

16. **`resolveActiveClassScope` trusts URL/cookie (high):** URL → cookie → assignment. Use a
    DB-derived allowed set; never authorize from the helper.
17. **`.limit(1)` under-scopes (medium):** `getAssignedClassSection`; add plural method.
18. **`getClassSections` lacks `school_id` (high):** upgrade the repository method.
19. **Class selector visible to all non-`class_teacher` (medium):** server-side subject scope;
    defer selector restriction.

## Assignment data findings

20. **48 duplicate active offerings (high):** 463 rows, 0 unassigned, no unique index. Add
    conflict panel; block self-assign; explicit replacement; no auto-delete.
21. **Two-step supported but empty (medium):** 0 unassigned; Step 1 creates offerings.
22. **Toggle is a compatibility loan (medium):** reuse `auto_approve`, off by default; verify
    no legacy use; dedicated setting only if schema changes.
23. **Immediate self-assign expands privilege (high):** opt-in, non-admin/IT, zero
    assignments, catalog-only, atomic checks, audit, revoke.
24. **App unusable without a class (high):** `422 TENANT_SCOPE_REQUIRED`, onboarding/filestore
    require class; no global redirect. `/people` bootstrap; redirect `/`/`/chat`; no loop.
25. **Selector exposes classes pre-assignment (medium):** redirect unassigned staff; ignore
    cookie/URL for `/people`; defer selector fix.

## Performance and repository findings

26. **No name/email indexes; search scans (medium):** MariaDB 11.5.2; 87 staff, 567 parents,
    900 students, 39 subjects, 71 class-sections, 463 assignments. Server search, 300ms
    debounce, min 2 chars, bounded pages. Record `EXPLAIN`; indexes need schema approval.
27. **Parallel query layer would duplicate repos (high maintainability):** extend
    `StaffRepository`, `ParentRepository`, `StudentRepository`, `ResultRepository`,
    `AssignmentRepository`, `SettingsService`; reuse `withErrorHandling`,
    `ScopedRepositoryProvider`, `getAcademicId`. Add only necessary methods.
28. **Offerings must not ship wholesale (medium):** 463 rows would bloat payload. Load
    offerings lazily per selected class; initial payload = config/classes/subjects/conflicts/
    count.
29. **N+1 risk in badges/counts (high):** use `LEFT JOIN users` for linked, a derived email
    aggregate for duplicates, and one aggregate query per tab. No per-row queries.

## `/people` design rules

1. Token colors/radii only.
2. 44px touch targets.
3. Scrollable tabs; no page horizontal scroll.
4. Tables become cards below `md`.
5. Labels ≥12px; body ≥14px.
6. Visible focus rings.
7. Safe-area bottom.
8. Empty states `bg-muted/50 border-border`; onboarding solid card.
9. Skeletons `aria-busy`+label.
10. Dark/reduced-motion inherit.
11. DB-only class access.
12. Admin class lists school-filtered.
13. One active teacher per offering.
14. Conflicts block self-assign.
15. Toggle off by default; immediate disable.
16. `/people` loads without class/workspace.
17. Redirect unassigned from `/`/`/chat`; `/people` exempt.
18. Self-assign sets cookie and invalidates.
19. Repository-first; no parallel query layer.
20. Query budget met; no N+1; bounded lists.
21. Lazy offerings.
22. `EXPLAIN` recorded.

## Deferred global fixes

- Border/input contrast; primary/destructive contrast; duplicate font block; landscape nav;
  global focus-visible; raw shadows; filestore arbitrary classes.
- Validate cookie/URL in `resolveActiveClassScope`; multi-class resolver; `school_id` in
  `getClassSections`; restrict selector.
- Clean duplicate assignments; unique index/toggle setting only if schema changes allowed.
- Add name/email indexes only if search latency requires it and schema changes are approved.
