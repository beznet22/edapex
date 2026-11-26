# 02 — Layout & Responsive Blueprint

Reference: `src/routes/(chat)/filestore/+page.svelte` for the shell. All colors, borders and
radii come from tokens in `src/routes/layout.css`. Standard spacing/type utilities are
allowed; arbitrary `[...]` values and raw colors are not.

## Structural blueprint

```svelte
<div class="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
  <ChatHeader />

  <div class="safe-area-bottom min-h-0 flex-1 overflow-y-auto bg-background">
    <div class="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-10">
      <PeopleHeader />
      <PeopleKpis />
      <div class="space-y-3">
        <PeopleTabs />
        <PeopleFilterMenu />
        <ActiveTable />
        <PeoplePager />
      </div>
    </div>
  </div>
</div>
```

Differences from filestore: KPI strip; tabs only; no grid/list toggle; no bulk bar; tables
(cards below `md`). `/people` must render without a class/cookie/workspace; do not use
filestore/tenant resolvers in its load.

## Header

| Element | Classes (mobile → desktop) | Notes |
| --- | --- | --- |
| Wrapper | `flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between` | Stacks at 320px |
| Title | `text-2xl font-black uppercase tracking-tight sm:text-3xl lg:text-4xl` | Display weight |
| Description | `mt-1 max-w-prose text-sm leading-6 text-muted-foreground` | One or two lines |
| Search | `min-h-11 w-full rounded-full border border-border bg-muted/40 pl-11 text-sm sm:min-h-10 sm:w-80` | Full width mobile |
| New / Add | `min-h-11 w-full rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground sm:min-h-10 sm:w-auto` | Opens menu/dialog |

`New` menu (admin/IT): Add staff; Manage assignments; Self-assignment settings.
Header action (unassigned staff, toggle on): **Add class**.

At 320px the header stacks; search/action full-width.

## Tabs and filter

- Tab strip `-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide sm:mx-0 sm:px-0`.
- Pill `min-h-11 shrink-0 rounded-full px-4 text-sm font-bold sm:min-h-9`; active
  `bg-primary text-primary-foreground`; inactive `text-muted-foreground hover:bg-muted/50
  hover:text-foreground`.
- Filter button `min-h-11 rounded-full border border-border px-3 text-sm font-bold
  sm:min-h-9`; funnel icon always, label hidden below `sm`, numeric badge.
- Filter menu: status radios, sort key, direction, “Include removed people” (Staff).
  Width `w-72` mobile / `w-64` desktop.
- Tabs: Staff, Parents, Students. No Duplicates tab.

## Unassigned empty state

When the viewer is a non-admin/IT staff member with zero active assignments:

- Render the Students tab with a centered `rounded-xl border border-border bg-card p-6`
  panel (not a dashed low-contrast box).
- Icon (`bg-muted text-muted-foreground`), title `text-lg font-semibold`
  “No class assigned yet”.
- Body `text-sm text-muted-foreground`: the rest of the app needs a class, section and
  subject assignment.
- If toggle on: primary `Add class` button (`min-h-11 rounded-full bg-primary px-4
  text-primary-foreground`), opening the self-assign dialog.
- If toggle off: no button; a muted instruction to ask an administrator.
- Do not show a generic error banner or 403. This is onboarding, not failure.
- The header KPI strip and tabs may render disabled/empty; do not show misleading zeros.

Redirect rule lives server-side (`(chat)/+layout.server.ts`): unassigned non-admin/IT staff
on `/` or `/chat` go to `/people?onboarding=1`; `/people` is exempt.

## KPI strip

`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4`

- Group card `sm:col-span-2 rounded-xl border border-border bg-card p-4`; metrics
  `flex flex-wrap items-end gap-x-6 gap-y-3`; dot `size-2 rounded-full`; label `text-xs
  uppercase tracking-wide text-muted-foreground`; value `text-2xl font-semibold tabular-nums`;
  separators `border-l border-border pl-6`.
- Figure `rounded-xl border border-border bg-card p-4`; value `text-2xl font-semibold
  tabular-nums`; badge `rounded-full border border-border px-2 py-0.5 text-xs`; caption
  `text-xs text-muted-foreground`.
- Staff: Active / Account / No email + Linked % + Needs attention.
- Parents: Linked / Unlinked / Duplicate email + Linked % + Needs attention.
- Students: Students / Active / No admission + On roll + Needs attention.

## Responsive table → cards

`people-table.svelte` renders both:

1. **Desktop (`md`+):** `<table class="w-full">` inside
   `overflow-hidden rounded-xl border border-border bg-card`; header cells `px-3 py-2
   text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground`; rows
   `border-t border-border hover:bg-muted/40`; cells `px-3 py-3 text-sm`; sortable headers
   are buttons with `aria-sort`.
2. **Mobile (<`md`):** `flex flex-col gap-2` cards; `rounded-xl border border-border bg-card
   p-4`; avatar + name, status pill, secondary lines. Separate interactive elements; the
   card is not a button.

No page-level horizontal scroll; `truncate` + `min-w-0` for long values.

## Pager

- Wrapper `mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`.
- Summary `text-xs text-muted-foreground`: `Showing X–Y of Z` / `No results`.
- Rows select `min-h-11 rounded-md border border-border bg-background px-2 text-sm
  sm:min-h-9`.
- Page controls `min-h-11 min-w-11` mobile / `min-h-9 min-w-9` desktop; window
  `1 … current±1 … last`; disabled edges `aria-disabled` + `pointer-events-none opacity-50`.
- Page clicks `noScroll: false`; search/filter `true`.

## Dialogs

- `$lib/components/ui/dialog` primitives.
- Content `max-h-dvh overflow-y-auto rounded-xl border border-border bg-popover p-4
  text-popover-foreground sm:max-w-lg`; assignment dialog `sm:max-w-2xl`.
- Header `text-lg font-semibold`; description `text-sm text-muted-foreground`.
- Labels `text-sm font-medium`; inputs/selects `min-h-11`; two-column grid at `sm`.
- Footer stacks full-width on mobile (`flex flex-col-reverse gap-2 sm:flex-row
  sm:justify-end`), destructive last.
- Notices `rounded-lg border border-border bg-muted/40 p-3`.
- Focus trap/restore from the primitive.

## Assignment and onboarding UI

- **Admin:** New → Manage assignments (stepper: Class subjects, Assign teacher, Conflicts,
  Settings).
- **Admin staff row:** Manage classes opens the same dialog, teacher preselected.
- **Unassigned staff:** Add class opens the self-assign dialog (class + subject multi-select).
  Hidden when ineligible/toggle off.
- **After self-assign:** set `selected-class`, `invalidateAll()`, navigate to
  `/people?tab=students&classId=…&sectionId=…`; chat/filestore become usable.
- All controls ≥44px on touch; token classes only.

## PWA and mobile rules

- `viewport-fit=cover` already set; use `safe-area-bottom` on the scroll container.
- Touch targets ≥44px; desktop may use `sm:min-h-9/10`.
- No hover-only affordances.
- No fixed viewport heights inside; rely on flex/`dvh`.
- Avatars `size-10 rounded-full`, `bg-muted text-muted-foreground` fallback, photos
  `object-cover`.
- Skeleton `animate-pulse` + `bg-muted`; container `aria-busy` + label.
- Reduced motion is global; no new animations.

## Token substitution table

| Filestore class | `/people` class | Reason |
| --- | --- | --- |
| `rounded-3xl` | `rounded-xl` | Radius token |
| `text-[10px]`, `text-[11px]` | `text-xs` | No arbitrary values; legibility |
| `h-9`, `h-10` | `min-h-11` touch, `sm:min-h-9/10` | 44px target |
| `bg-accent/10`, `border-accent/50` | `bg-muted/50`, `border-border` | Accent near background |
| raw `oklch` shadow | `shadow-sm` | Shadow token |
| file-card grids | table/card rows | Directory data |

## Width matrix

| Width | Header | Tabs | KPI | Data |
| --- | --- | --- | --- | --- |
| 320px | stacked, full-width action | horizontal scroll | 1 column | cards |
| 375px | stacked | horizontal scroll | 1 column | cards |
| 768px | row, 20rem search | scroll if needed | 2 columns | table |
| 1024px | row | fits | 2 columns, group spans 2 | table |
| 1280px+ | row | fits | 4 columns | table |
