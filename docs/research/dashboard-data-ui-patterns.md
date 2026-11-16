# Research — Data-Management Dashboard UI Patterns (2025–2026)

**Status:** research note, not normative. Spec `15-ui-surfaces.md` owns layout and behaviour,
`19-design-system.md` owns tokens and primitives, `DESIGN.md` is the machine-checked visual
authority. Where this note disagrees with those, they win — this document supplies numbers,
sources and implementation recipes for the *dashboard/table* surface (`Admin › People`,
`Admin › Claim links`, and the KPI row above them) that none of the existing specs cover.

**Scope:** the EdApex people directory — KPI stat tiles, tab strip, search/filter bar, and a
dense table of staff/students with avatar, name, secondary line, status pill and row-actions
menu — across desktop (Windows/macOS/Linux, Tauri), mobile (iOS/Android, Tauri) and web/PWA.

**Evidence rule (inherited from `README.md` §Ground rules):** every number below is either
(a) quoted from a published spec, article or API doc, (b) measured from this repository, or
(c) computed from this repository's own OKLCH tokens by the method in §11. Nothing is
"typical" or "about right" without one of those three labels. Where a well-known product has
**not** published its numbers, this document says so instead of guessing.

---

## 0. Findings that change code in this repository

Five things are wrong or missing today, in severity order. §0.6 is a sixth, found while
checking the motion story. Everything after §0 is the evidence.

| # | Finding | Where | Fix |
|---|---|---|---|
| 0.1 | `scrollbar-width: thin` on `*` **disables every `::-webkit-scrollbar` rule** in Chrome 121+, Safari 18.2+ and Edge 121+. The 6px size, the `border-radius: 999px`, the `background-clip: content-box` and the hover `transition` never apply there; only the `scrollbar-color` half works — and `scrollbar-color` only reaches Safari at 26.2. | `apps/web/app/globals.css` (~L540–600) | Either drop `scrollbar-width`/`scrollbar-color` on Chromium/WebKit and keep the pseudo-elements, or drop the pseudo-elements and accept platform `thin` geometry. Do not ship both expecting custom geometry. Recommended rewrite in §6.3. |
| 0.2 | **Amber and red pills fail WCAG AA for small text.** `bg-warning/10 text-warning` composites to **4.35:1**, `bg-destructive/10 text-destructive` to **4.22:1**; both are 12px (`text-xs`), so 4.5:1 applies. The green pill passes at 4.97:1. | `components/ui/badge.tsx`, `components/admin/DirectoryTable.tsx` | Add `--warning-ink` / `--destructive-ink` tokens. Measured replacements in §2.4. |
| 0.3 | **No sticky header anywhere in the app** (`position: sticky` appears zero times in `components/`). A 581-row directory loses its column labels one scroll down. | `components/ui/table.tsx` | `thead th { position: sticky; top: 0 }` + opaque background + `box-shadow` hairline, not `border`. Recipe in §3.6. |
| 0.4 | **Header and body rows disagree in height.** `TableHead` is `h-10` (40px); `TableCell` is `p-3` + `text-sm` ⇒ **44px**. The header is the short one, which reads as a rendering bug. | `components/ui/table.tsx` | Drive both from one `--row-h` token (§3.2). |
| 0.5 | `border-collapse` + `position: sticky` drops the header's bottom border in every engine (Chromium, Gecko, WebKit all have long-standing bugs). | future sticky header | Use `box-shadow: inset 0 -1px 0` for the header hairline, and `border-collapse: separate; border-spacing: 0`. §3.6. |
| 0.6 | **The reduced-motion block contradicts its own comment.** The comment says "opacity still animates, transforms do not"; the rule is `transition-duration: 0.01ms !important` on `*`, which kills opacity too. Separately, `sheet.tsx` animates at 300/500ms, ignoring `--motion-panel: 280ms` / `--motion-exit: 160ms`. | `globals.css` (~L886) and `components/ui/sheet.tsx` (L34) | Property-scoped reduced motion (§9.3); re-point the sheet's durations at the tokens. |

Also measured, not a bug: `scrollbar-gutter` is used nowhere, and `@container` / `container-type`
are used nowhere. Both are recommended in §4 and §6 and both are Baseline.

---

## 1. Dashboard layout patterns (2025–2026)

### 1.1 What each product actually publishes

| Product | Published evidence | What it tells us | What it does **not** publish |
|---|---|---|---|
| **Vercel (Geist)** | Full public design-system docs, incl. a `Table` page with *Behaviour*, *Content* and *Best practices* rules; a `Typography` page listing `text-label-12/13/14` and `text-copy-13/14`. | Row content rhythm: `Label 14` is "the most common text style of all"; `Copy 13` is "for secondary text and views where space is a premium"; `Label 12` is "tertiary level text in busy views". Sortable headers are **buttons**; `—` for unknown values; `tabular-nums` on numeric columns; empty state goes *outside* the table. | px row heights. Geist documents type styles, not row metrics. |
| **Linear** | Two design write-ups (2024 redesign, 2026 refresh). | 2026: *"Don't compete for attention you haven't earned"* — the sidebar and tabs were **dimmed and shrunk**; *"Structure should be felt not seen"* — borders were **rounded and reduced in contrast** and their count cut. 2024: custom themes generated in **LCH** from three inputs (base, accent, contrast), so a whole palette has uniform perceptual lightness. | Row heights, font sizes, easing curves. Linear's public notes are philosophy, not spec. |
| **Stripe Dashboard** | One engineering post on colour (2019), still the canonical reference. | Colour scales built in **CIELAB** so every hue has the same contrast curve; any two colours **≥5 levels apart** pass for small text, **≥4** for icons/large text; badges redesigned by moving *both* background and text up one level rather than hand-tuning pairs. | Any layout metric. |
| **Attio** | Third-party style analysis (Curio, 2026) of the shipped product, not first-party. | "Row heights are compact; column widths are fitted to content"; single-pixel borders; **flat depth without shadow** — layer changes come from border contrast and background-tone shifts, not elevation. | First-party numbers. Treat as description, not spec. |
| **Notion** | Help-centre documentation of database settings only. | Table rows each open a **page** — the row is a doorway, not a container. | Row heights, density steps. Not published. |
| **Height** | Product marketing only at time of writing. | — | Nothing usable. Do not cite Height for numbers. |
| **Raycast** | Public extension API (`List`, `List.Item`, `List.Item.Detail.Metadata`, `List.EmptyView`). | The anatomy EdApex wants: `icon` + `title` + `subtitle` + `accessories` on the right + `actions` panel. `List.EmptyView` is **never shown while `isLoading` is true and the query is empty**. | px row heights — Raycast renders natively and does not publish metrics. |

**The honest summary:** none of the seven publish row-height tables. The only products with
numeric row specs are the component libraries (§3.1). Everything the seven *do* publish is
philosophy plus anatomy, and that philosophy is remarkably consistent:

1. **Recede the chrome, keep the data forward.** Linear 2026 dims sidebar/tabs; Attio keeps
   the field achromatic and reserves colour for state.
2. **Fewer borders, softer borders.** Linear 2026 explicitly reduced border count *and*
   contrast, and rounded their ends. Attio achieves layering with 1px borders instead of shadow.
   These pull in opposite directions on *weight* but agree on *count*: one separator per
   relationship, never a grid of frames.
3. **Every value must earn a column.** Geist: "Use `Table` for tabular data where rows share the
   same shape and at least one column is sortable or comparable across rows."
4. **Rows are identifiable at a glance.** Geist: label Title Case, numbers `tabular-nums`, `—`
   for unknown — never `N/A`, `null` or empty.

### 1.2 The layout EdApex should ship

```
┌─ PageShell (max-w-[92rem], px-4 sm:px-6 lg:px-8, py-6 lg:py-8) ──────────────────┐
│  Header row        title 22/600 · subtitle 13/400 muted · one primary action      │
│  KPI row           2 cols @<640 · 4 cols @≥640 · 4–6 cols @≥1280, gap 12–16px     │
│  Tab strip         40px tall, underline indicator 2px, 1px bottom rule           │
│  Filter bar        search (grow) + 2–3 selects + view menu, 40px controls, gap 8  │
│  Table card        1px border, radius 14px, white on oklch(0.982 …) canvas        │
│    └ sticky header 40px, opaque, box-shadow hairline, sortable <button>s          │
│    └ rows          --row-h: 44 / 52 / 64 by density                               │
│    └ footer        count + page size + prev/next, 13px muted                      │
└──────────────────────────────────────────────────────────────────────────────────┘
```

- The card is the **only** bordered container on the surface. KPI tiles sit directly on the
  canvas with a hairline, not on a second bordered card — a card inside a card is the
  "colored card soup" failure mode in structural form.
- `DESIGN.md` already forbids the alternative: *"Don't use a hard border to divide two panels;
  use elevation."* The table card is the exception that proves it, because a table needs an
  edge to clip its own scroll container against.

---

## 2. Stat tiles / KPI cards

### 2.1 Visual hierarchy, top to bottom

| Layer | Token | Why this order |
|---|---|---|
| **Value** | 28/600, `tabular-nums`, `-0.02em` | The only element at display weight. Digits must be tabular or the row of tiles "dances" as numbers change. |
| **Label** | 13/500, `--muted-foreground` (5.14:1 on canvas) | Read once to locate the tile, then never again. Muted is correct; it is not a legibility compromise. |
| **Delta** | 13/500, semantic ink + arrow glyph | Direction *and* sentiment, decoupled (§2.2). |
| **Comparison window** | 13/400 muted, or in the label if short | "vs last term" — a delta without a window is an ambiguous percentage. |
| **Sparkline** *(optional)* | 1.5px stroke, no axis, 24–32px tall | Shape only. If it needs axes it belongs in the detail view. |

SaaSUI's 2026 KPI survey states the rule the hard way: *"a number with no context is trivia,
not insight."* Every tile answers **what is it / how has it changed / is that good.**

### 2.2 Direction ≠ sentiment

Green-up/red-down is wrong for attendance-absence, churn, overdue fees, unresolved issues.
The mature pattern: **the arrow shows which way the number moved; the colour reflects whether
that movement is desirable for this metric specifically.** Each tile therefore carries a
`goodDirection: "up" | "down"` field — a per-metric decision, not a global style.

For a school system the mapping is concrete:

| Metric | Good direction | Note |
|---|---|---|
| Claimed accounts | up | green up |
| Unclaimed / no-user records | down | green **down**; red if it rises |
| Duplicate emails, flagged records | down | red up — this is a data-quality alert |
| Link expiry within 7 days | down | amber up (a task, not a failure) |

### 2.3 Avoiding "coloured card soup" — six rules

1. **One accent per row of tiles.** `--success`, `--warning`, `--destructive` never fill a tile
   background. They appear as *ink only* on the delta and, at 10–12% alpha, on pills. Tile
   surfaces are `--card` or `--background` + hairline, full stop.
2. **Hierarchy before count.** Lead with 2–3 tiles at full size; secondary metrics go smaller
   or below the fold. Twenty equal tiles prioritise nothing.
3. **One structure, repeated.** label / value / delta in the same order in every tile. A row is
   scanned, not read.
4. **Uniform contrast across hues.** This is Stripe's actual contribution: build the scales so a
   green and an amber at the same level have the same contrast. Without it, the green pill always
   looks louder than the amber one and the row reads as inconsistent rather than semantic.
5. **No tile chrome beyond a hairline.** `--elevation-1` at most. Elevation 2/3 is for overlays.
6. **The zero state is good news, the empty state is onboarding.** "0 duplicates" is calm, not
   broken. "No data yet" explains what will appear and offers the action that creates it.

### 2.4 Measured pill and delta recipes for this repo

Method: OKLCH → sRGB → WCAG 2.x relative luminance, with the semantic ink alpha-composited over
the card (see §11). AA for 12–13px text is **4.5:1**; non-text UI is **3:1**.

| Pill | Background | Ink (light) | Contrast on its own 10% tint over `--card` | Verdict |
|---|---|---|---|---|
| Accepted / Claimed | `color-mix(in oklch, var(--success) 10%, var(--card))` | `--success` `oklch(0.50 0.11 150)` → `#2b7440` | **4.97:1** | ✅ ships as-is |
| Pending / Unclaimed | same, `--warning` | `--warning` `oklch(0.55 0.12 75)` → `#9a6500` | **4.35:1** | ❌ fails 4.5 |
| Pending / Unclaimed | same | **`--warning-ink` `oklch(0.52 0.115 72)`** → `#915c00` | **4.91:1** | ✅ new token |
| Canceled / Flagged | same, `--destructive` | `--destructive` `oklch(0.57 0.165 24)` → `#c64545` | **4.22:1** | ❌ fails 4.5 |
| Canceled / Flagged | same | **`--destructive-ink` `oklch(0.52 0.15 25)`** → `#af3c3a` | **5.13:1** | ✅ new token |
| Neutral / No user | `--muted` solid | `--muted-foreground` `#6c6a64` | **4.77:1** | ✅ |

Dark mode is already correct and needs no new ink tokens — measured on each token's own 10%
self-tint over dark `--card` `#252320`:

| Dark pill | Shipping token | Hex | On @10% tint | On @12% tint |
|---|---|---|---|---|
| Claimed | `--success oklch(0.72 0.13 150)` | `#62bb78` | 5.60:1 | 5.39:1 |
| Unclaimed | `--warning oklch(0.78 0.13 80)` | `#e3ad4b` | 6.36:1 | 6.09:1 |
| Flagged | `--destructive oklch(0.70 0.15 24)` | `#ed7470` | 4.74:1 | 4.59:1 |

The dark ink floor that still reaches 4.5:1 on a 12% tint over `#252320` is L ≈ 0.666–0.695 by
hue; anything darker fails. Dark `--destructive` sits at 4.59:1 at a 12% tint — it passes, but
with no headroom, so **use 10% tints in dark** and reserve 12% for light.

```css
/* apps/web/app/globals.css — add beside --success / --warning / --destructive */
--warning-ink:      oklch(0.52 0.115 72);   /* 4.91:1 on warning@10 over card */
--destructive-ink:  oklch(0.52 0.15 25);    /* 5.13:1 on destructive@10 over card */
--success-ink:      var(--success);         /* 4.97:1 — already passes */
```

Tile-delta ink uses the same three tokens; a delta is not a pill and gets **no** background.

---

## 3. Data table density and readability

### 3.1 Row heights, from the products that publish them

| System | Compact | Default | Comfortable | Other |
|---|---|---|---|---|
| **Carbon** (spec page, updated 2026-09-30) | **24** (xs) / **32** (sm) | **40** (md) | **48** (lg) | 64 (xl, "only if a row holds two lines") |
| **MUI X DataGrid** (`rowHeight` docs) | density `compact` | **52** — "matches the normal height in the Material Design guidelines" | density `comfortable` | cell padding presets 8 / 15 / 22px |
| **M3 lists** (spec tokens) | — | **56** dp one-line | 72 dp two-line | 88 dp three-line |
| **M3 tabs** (spec tokens) | — | 48 dp (label only) | 64 dp (icon + label) | indicator 3 dp primary / 2 dp secondary |
| SaaS density survey (2026) | 28–32 | 36–40 | 48–52 | — |

Carbon's own text is the most useful sentence in the table: *"Tall row heights are only
recommended if your data is expected to have 2 lines of content in a single row."* EdApex rows
**do** carry two lines (name + secondary), which is exactly why 44–52 and not 40.

### 3.2 The recommendation

| Density | `--row-h` | Padding-block | Use |
|---|---|---|---|
| Compact | **40px** | 8px | Power-user toggle; pointer-fine only |
| **Default** | **52px** | 10px + two-line text block | ships for everyone |
| Comfortable | **64px** | 16px | Touch, and any row with an interactive third line |

Two hard constraints on those numbers:

- **Below 44px must not reach touch.** A 40px row is a fine mouse target and a poor thumb
  target (Apple 44pt, Material 48dp, WCAG 2.5.8 24px absolute floor). Force `--row-h: 64px`
  under `@media (pointer: coarse)`, regardless of the saved preference. Density is a
  pointer-fine luxury.
- **Fixed heights only.** A density toggle plus variable-height rows means dynamic measurement
  and a jumping scroll thumb. If virtualization is ever added, feed it the same `--row-h`.

```css
/* one property drives header, body, skeleton and empty state */
.directory-table {
  --row-h: 52px;
  --row-pad: 10px;
}
.directory-table[data-density="compact"]      { --row-h: 40px; --row-pad: 8px; }
.directory-table[data-density="comfortable"]  { --row-h: 64px; --row-pad: 16px; }
@media (pointer: coarse) {
  .directory-table { --row-h: 64px; --row-pad: 16px; }
}
.directory-table thead th { block-size: calc(var(--row-h) - 4px); }
.directory-table tbody td { block-size: var(--row-h); padding-block: var(--row-pad); }
```

The header is deliberately **4px shorter** than a body row: it carries one line of 13px
uppercase, and matching a two-line body exactly makes the header look padded. Carbon does the
same thing by letting the header take the table's row size while the header *content* is
single-line.

### 3.3 Typography scale inside the table

`DESIGN.md` caps the system at three sizes (22/15/13). A table is the one place that needs a
fourth *weight* rather than a fourth *size*:

| Element | Size / weight / tracking | Token |
|---|---|---|
| Column header | 12 / 600 / `0.04em`, uppercase | `--muted-foreground` |
| Primary cell (name) | 14 / 500 | `--foreground` |
| Secondary cell line (email, phone) | 13 / 400 | `--muted-foreground` (5.41:1 on card) |
| Numeric cell | 14 / 400, `font-variant-numeric: tabular-nums` | `--foreground` |
| Pill text | 12 / 500 | semantic ink |
| Footer / count | 13 / 400 | `--muted-foreground` |

Headers are **12px, not 13px**: at 13/600 uppercase the header competes with the data. Geist's
`text-label-12` is described for exactly this — "tertiary level text in busy views". Uppercase
+ 0.04em tracking is what makes 12px scannable rather than small.

### 3.4 How many columns before the card list

The published advice converges on **five to six** (SaaSUI: "the five or six columns that let a
user identify the row and make the next decision"; density survey: "cap default visible columns
at six to eight"). For a school directory:

**Always visible (≤6):** `Name` (avatar + name + email stacked) · `Role` · `Status` ·
`Identifier` (staff no. / admission no.) · `Last activity` · `` (actions menu).

**Behind a column picker:** phone, claim status, Google link, duplicate flag, link expiry.
These are all *investigation* fields, not *scanning* fields — they belong in the drawer.

**Card-list switch trigger:** not a column count but a **measured content width**. If
`container-type: inline-size` on the table wrapper reports **< 640px**, the table cannot show
five columns at ≥120px each with 16px gutters, so render cards. See §4.

### 3.5 Drawer vs modal vs full page

| Need | Pattern | Reason |
|---|---|---|
| Inspect one person, act on them, return | **Detail drawer / side sheet** (desktop `sheet`, side="right", 400–480px; mobile bottom sheet) | Preserves the list — scroll position, filters, sort, and the neighbouring rows the admin is comparing against. Smashing Magazine 2026: modals are for "single, self-contained tasks"; drawers "work for sub-tasks that are too complex for a simple modal". |
| Confirm a destructive action (revoke link, delete record) | **Modal / alertdialog** | The blocking dim *is* the severity signal. Geist's Drawer page says it outright: "Don't use Drawer to confirm destructive actions. The lack of a fully blocking dim weakens the severity signal that delete and revoke flows need; route to Modal." |
| Edit 8+ fields, or a stable URL is needed | **Full page** | Long multi-step flows inside modals force users to open the same page in several tabs to compare. |
| Change one field | **Inline edit in the cell** | Repeated tasks should never leave the list. |

Decision order (from the 4-step decision tree in the Smashing article): *does the user need the
underlying screen? → how long is the task? → do they need to reference background data? → which
overlay?* EdApex: inspection is short + background-visible ⇒ drawer, always. Only the confirm
step escalates to a modal.

### 3.6 Horizontal overflow and the sticky header

```css
/* wrapper — Roselli's "under-engineered responsive table", minus the role */
.table-scroll {
  overflow: auto;
  overscroll-behavior-x: contain;   /* don't chain to the page's back-gesture */
  scrollbar-gutter: stable;         /* ! the emblem of §6: no layout shift on gain/loss */
}
.table-scroll:focus-visible { outline: 2px solid var(--ring); outline-offset: -2px; }

/* sticky header that keeps its hairline in every engine */
.directory-table table { border-collapse: separate; border-spacing: 0; }
.directory-table thead th {
  position: sticky;
  inset-block-start: 0;
  z-index: 1;
  background: var(--card);                    /* must be opaque — see below */
  box-shadow: inset 0 -1px 0 var(--border);   /* border-b dies under sticky */
}
```

Three separate bugs this avoids:

1. **`border-collapse: collapse` + `position: sticky` loses the header border** in Chromium,
   Gecko and WebKit. Use a `box-shadow` inset instead — it paints with the header, not the row.
2. **A transparent sticky header shows rows scrolling through it.** Opaque `--card` is
   mandatory; `backdrop-filter` is not a substitute on a table (it re-blurs per frame, and
   `DESIGN.md` already limits blur to the composer and above `md`).
3. **No focusable scroll region = WCAG 2.1.1 failure.** Roselli's minimum is
   `<div tabindex="0">` around the table plus `overflow: auto`; he notes that as of **October
   2026** AGWG's position is that a `role`/accessible name is no longer required for a
   focusable generic container. Keep the `tabindex`, drop the ceremony.

Horizontal overflow is *permitted* for the table by WCAG 1.4.10's reflow exception — but only
for the table. The filter bar, pagination, and heading above it are **not** excepted and must
stack into one column at 320px.

---

## 4. Responsive table → card transformation

### 4.1 Breakpoints used in production (and in this repo)

`15-ui-surfaces.md` sets the test band **320, 375, 430, 768, 1024, 1280, 1920**;
`apps/web/e2e/workspace.spec.ts` asserts no horizontal overflow at
**320, 360, 430, 768, 1024, 1440, 1920**. Use the union the tests use, and add 640:

| Range | Shell | Directory presentation |
|---|---|---|
| 320–639 | bottom tab bar | **card list** (no table at all) |
| 640–1023 | bottom tab bar | table, 4 columns, `Name` sticky-left, horizontal scroll for the rest |
| 1024–1439 | 72px rail | table, 6 columns |
| ≥ 1440 | rail | table, 6 columns + column picker |

**640 is the switch, not 768.** Five columns × 120px + 4 × 16px gutters = 664px; below that the
name column truncates before the container is actually tight. 640 is also Tailwind's `sm`, so
the switch needs no new token.

### 4.2 What survives the collapse

Cards are not "the row, stacked". They are a re-prioritisation:

| Table column | Card fate |
|---|---|
| Avatar + Name | **survives** — becomes the card header |
| Secondary line (email/phone) | **survives** as the card's second line |
| Status pill | **survives**, top-right of the card header |
| Role / Persona | **survives** as a 12px eyebrow above the name, or as a chip |
| Row actions | **survives** as a single `⋯` button, 44×44, top-right |
| Identifier (staff no.) | **demoted** to the drawer |
| Last activity | **survives** as a muted footer line — it is the "is this stale?" signal |
| Claim / Google / Duplicate / Link expiry | **dropped** to the drawer |

Rule of thumb from the density survey: *"render each row as a card carrying the two or three
fields that matter"*. EdApex's card carries **five** (name, secondary, role, status, activity) —
because the status pill is the reason an admin opened this screen at all. Everything else is one
tap away.

Critically: **the card list is not a table with `display: block` on the rows.** That is the
pattern Roselli warns about — browsers have broken table semantics on CSS `display` overrides
for a decade, and you end up re-adding ARIA to recover what you destroyed. Render two different
component trees from one data array:

```tsx
// one fetch, one state, two presentations
{isNarrow ? <PersonCardList rows={rows} /> : <DirectoryTable rows={rows} />}
```

### 4.3 Container queries, not media queries

A directory rendered inside a 760px chat canvas and inside a 1440px PageShell is the same
component at two widths. `@media` cannot know that; `@container` can. Baseline, and Tailwind v4
supports `@container` natively with `@sm:`/`@md:` variants.

```css
.table-card-shell {
  container-type: inline-size;
  container-name: people;
}

/* cards below 640 of the container, table above — regardless of viewport */
@container people (width < 40rem) {
  .people-table-view { display: none; }
}
@container people (width >= 40rem) {
  .people-card-view { display: none; }
}
```

```tsx
// component-level, idiomatic Tailwind v4
<div className="@container">
  <div className="hidden @2xl:block"><DirectoryTable /></div>
  <ul  className="@2xl:hidden"><PersonCardList /></ul>
</div>
```

`@2xl` = 42rem = 672px, and `@xl` = 36rem = 576px — pick `@xl` if you want the switch closer to
the 640 number above; either is a container query, which is the point.

### 4.4 CSS grid + subgrid for card internals

Subgrid (Baseline, Sept 2023) is what makes a card list align across rows without hard-coded
widths — the pill column lines up down the whole list even though the names differ in length:

```css
.person-cards {
  display: grid;
  grid-template-columns: 1fr auto;      /* content | status + actions */
  column-gap: 12px;
}
.person-card {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: subgrid;
  align-items: start;
  padding: 12px 16px;
  border-block-end: 1px solid var(--border);
}
```

Caveat from the MDN subgrid guide: a subgridded dimension **cannot create implicit tracks**. If
cards can gain a variable number of rows (an extra warning line), subgrid `columns` only, and
let rows flow normally.

### 4.5 Where NOT to use `content-visibility`

`content-visibility: auto` + `contain-intrinsic-size` is tempting for a 581-row directory, and
it is Baseline (Sept 2024) and accessibility-safe (skipped content stays in the a11y tree). But
inside a `position: sticky` header table it interacts badly with scroll anchoring, and this
repo already budgets the directory at **p95 ≤ 800ms for 581 rows** (`47-performance-budgets.md`)
— pagination at 50/page is the actual fix, and it already exists. Do not add
`content-visibility` to the directory as part of this work.

---

## 5. Micro-interactions

### 5.1 The published curves, side by side

| Source | Curve | Value | Used for |
|---|---|---|---|
| **M3 standard** | `cubic-bezier(0.2, 0.0, 0, 1.0)` | decelerate `(0,0,0,1)`, accelerate `(0.3,0,1,1)` | "simple, small, or utility-focused transitions" |
| **M3 emphasized** | full Emphasized curve has **no CSS value** (Android `PathInterpolator` only; M3's CSS column says "N/A — use Standard as a fallback"). The two one-sided variants **do** have CSS: decelerate `cubic-bezier(0.05, 0.7, 0.1, 1.0)`, accelerate `cubic-bezier(0.3, 0.0, 0.8, 0.15)` | see left | expressive transitions |
| **M3 durations** | short1–4 = **50/100/150/200ms**; medium1–4 = **250/300/350/400ms**; long1–4 = **450/500/550/600ms**; extra-long = 700–1000ms | | short = selection controls; medium = medium-area traversal; long = large expressive, "often paired with Emphasized"; extra-long = ambient, no user input |
| **Apple** | HIG publishes principles (brief, precise, optional reduced-motion), not curves | — | `prefers-reduced-motion` is a first-class system signal |
| **This repo** | `--duet-ease` `cubic-bezier(0.22, 1, 0.36, 1)`; `--ease-exit` `cubic-bezier(0.3, 0, 0.8, 0.15)`; `--ease-enter` `cubic-bezier(0.05, 0.7, 0.1, 1)` | fast 120 / normal 200 / panel 280 / exit 160 / enter 220 | already the Gold-on-Slate motion set |

The repo's `--ease-exit` and `--ease-enter` **are M3's emphasized accelerate/decelerate**. So the
correct move is not to import M3 — it is to *use the tokens that already exist* and stop
inventing per-component durations.

### 5.2 Exact patterns

| Interaction | Property | Duration | Easing | Notes |
|---|---|---|---|---|
| **Row hover** | `background-color` | **120ms** (`--motion-fast`) | `--duet-ease` | fg@4% over card = `#f6f6f6`, 1.08:1 — a tint, not a highlight. Guard with `@media (hover: hover)` (already done globally). |
| **Row selected** | `background-color` + `box-shadow: inset 3px 0 0 var(--primary)` | 120ms | `--duet-ease` | primary@8% = `#f9f1ef` (1.11:1). The **3px left bar** carries the state, so selection is not colour-only (WCAG 1.4.1). |
| **Checkbox tick** | `transform: scale()` on the tick + bg | 100–150ms (M3 short2–3) | M3 standard | M3 explicitly pairs "selection control interactions" with 200ms; 150 is the snappier end. |
| **Sort changed** | Header arrow: rotate/fade **100ms**; rows: **no animation** | 100ms | `--duet-ease` | Reordering rows is disorienting; the arrow is the feedback. Do **not** FLIP-animate table rows. |
| **Filter change** | Table body: opacity 1 → 0.5 → 1 (`--motion-exit` out, `--motion-enter` in), **plus a 4px translateY** | 160ms out / 220ms in | `--ease-exit` / `--ease-enter` | Optional; the real requirement is that the result count announces (§8). |
| **Sheet/drawer entry** | `translateX(100%) → 0` | **280ms** (`--motion-panel`) | `--ease-enter` | M3 medium4 = 400ms is for full-screen; a side panel is a shorter distance. |
| **Sheet exit** | `translateX(0) → 100%` | **160ms** (`--motion-exit`) | `--ease-exit` | Exit faster than enter is deliberate and already documented in `globals.css`. |
| **Modal entry** | `opacity` + `scale(0.98) → 1` | 220ms | `--ease-enter` | Never scale from 0.8 — a dialog that grows from a dot reads as a cartoon. |
| **Backdrop** | `background-color: transparent → oklch(0 0 0 / 0.32)` | 200ms | linear | Linear is correct for a pure fade; an eased fade is felt as a delay. |
| **Tab underline** | `translateX` + `width` | 200ms | `--duet-ease` | Width animation on a 2px bar is cheap. Do **not** animate `width` on the tab labels. |
| **Toast** | `translateY(8px) + opacity` | 200ms in / 160ms out | enter/exit | — |

Two anti-patterns worth naming because they are everywhere in 2025–2026 dashboards: **animated
row reordering** (users lose the row they were tracking) and **scale transforms on toolbar
controls** (`DESIGN.md` already bans this: "Don't put a scale transform on a toolbar control —
it reads as a web page").

### 5.3 NN/g's three limits still gate all of this

| Limit | Meaning | Consequence for the table |
|---|---|---|
| **0.1s** | feels instantaneous | Sort, hover, selection, tab switch must all land under 100ms of *perceived* work — which is why sort should be local for ≤100 rows. |
| **1.0s** | flow of thought intact | A pagination fetch that exceeds 1s needs a visible busy state, not just a delayed skeleton. |
| **10s** | attention retained | Only here does a percent-done indicator earn its space. |

---

## 6. Slim auto-hiding scrollbars

### 6.1 The one rule that decides the whole implementation

> Browsers ignore the non-standard `::-webkit-scrollbar*` family on any element whose *computed*
> `scrollbar-width` is anything other than `auto` — and the same for `scrollbar-color`, which is
> **inherited**, so an ancestor's value disables the pseudo-elements too. Setting
> `scrollbar-width: auto` / `scrollbar-color: auto` restores them.
> — MDN, `scrollbar-width` and `::-webkit-scrollbar`, both current

This is why `::-webkit-scrollbar` "stopped working" in Chrome 121: Chrome shipped the standard
properties, and any page with `scrollbar-width: thin` had its custom geometry silently dropped.
**EdApex currently has exactly that combination** (`globals.css`: `* { scrollbar-width: thin;
scrollbar-color: … }` *and* `::-webkit-scrollbar { width: 6px; … }`). On Chrome 121+/Edge 121+/
Safari 18.2+ the width, radius, `background-clip` and hover transition are all inert; only the
`scrollbar-color` swap (which is what drives the auto-hide) still works.

### 6.2 Current support (caniuse, fetched for this note)

| Engine | `scrollbar-width` | `scrollbar-color` | `::-webkit-scrollbar` |
|---|---|---|---|
| Chrome / Edge | **121+** | 121+ | all, but disabled when the two properties are non-`auto` |
| Firefox | **64+** | 64+ | never |
| Safari (macOS) | **18.2+** | **26.2+** | all |
| Safari iOS | **26.2+** | 26.2+ | all (no effect on the platform's overlay indicator) |
| Global | 88.72% + 5.73% = **94.45%** | | |

Note the Safari split: `scrollbar-width` landed in **18.2** but `scrollbar-color` only in
**26.2**. Between those, Safari honours width and ignores colour — so a colour-only auto-hide
silently does nothing on Safari 18.2–26.1.

### 6.3 Decision for EdApex: one implementation, not two

Three viable strategies. Pick **B**.

**A. Standard properties only.** `scrollbar-width: thin` + `scrollbar-color`. Simplest, 94%
support, auto-hides for free where the platform uses overlay scrollbars. But `thin` geometry is
platform-defined (≈8–11px on Windows Chromium, 0 layout cost on macOS overlay), so it does not
match `DESIGN.md`'s 6px intent, and it *cannot* auto-hide on Windows, where the bar is classic
and always drawn.

**B. Pseudo-elements only, standard properties absent.** Ship `::-webkit-scrollbar` (Chromium +
Safari) and `scrollbar-width` **only inside `@supports not selector(::-webkit-scrollbar)`** for
Firefox. `scrollbar-color` is then never set in the WebKit path, so the pseudo-elements stay
alive and the 6px geometry, radius and hover transition all work. Requires
`data-scrolling` for the fade (the hook already exists: `hooks/use-auto-hide-scrollbars.ts`).
This is the only strategy that delivers "6px, rounded, fades after 900ms" identically on
Windows, macOS and Linux Chromium.

**C. JS overlay scrollbar** (custom-painted). Rejected: MDN and Roselli both warn that styling
scrollbars away from the platform "breaks external consistency"; a hand-painted bar also has to
re-implement drag, keyboard and trackpad inertia, and it fails Windows High Contrast Mode.

```css
/* B, concretely. Order matters: the Firefox branch must not leak to WebKit. */

/* ---------- Chromium + Safari: pseudo-elements, standard props left at auto ---------- */
@supports selector(::-webkit-scrollbar) {
  .scrollbar-auto { scrollbar-width: auto; scrollbar-color: auto; }

  .scrollbar-auto::-webkit-scrollbar { width: 6px; height: 6px; }
  @media (pointer: coarse) {           /* thumb is felt, not aimed at */
    .scrollbar-auto::-webkit-scrollbar { width: 4px; height: 4px; }
  }
  .scrollbar-auto::-webkit-scrollbar-button { display: none; }   /* Windows arrows */
  .scrollbar-auto::-webkit-scrollbar-track  { background: transparent; }
  .scrollbar-auto::-webkit-scrollbar-thumb {
    background-color: transparent;                                /* rest = invisible */
    border-radius: 999px;
    transition: background-color 120ms var(--duet-ease);
  }
  .scrollbar-auto[data-scrolling="true"]::-webkit-scrollbar-thumb,
  .scrollbar-auto:hover::-webkit-scrollbar-thumb,
  .scrollbar-auto:focus-within::-webkit-scrollbar-thumb {
    background-color: var(--scrollbar-thumb);
  }
  .scrollbar-auto::-webkit-scrollbar-thumb:hover {
    background-color: var(--scrollbar-thumb-hover);
  }
  .scrollbar-auto::-webkit-scrollbar-corner { background: transparent; }
}

/* ---------- Firefox (and anything without the pseudo-elements) ---------- */
@supports not selector(::-webkit-scrollbar) {
  .scrollbar-auto { scrollbar-width: thin; scrollbar-color: var(--scrollbar-thumb) transparent; }
}
```

### 6.4 Don't shift layout

`scrollbar-width: 6px` in Chromium **converts the overlay bar into a classic bar in the gutter** —
any `::-webkit-scrollbar` *width* does. (Chrome's own docs: *"when you set the `width` or `height`
of `::-webkit-scrollbar`, an overlay scrollbar is always displayed, effectively turning it into a
classic scrollbar"* — and `overflow: overlay` was removed in Chrome 114.) Consequences:

1. A container that gains its scrollbar reflows by 6px. Fix: `scrollbar-gutter: stable` on every
   scroll container. It costs 6px always and reserves it forever. (`stable both-edges` only where
   centred content must stay centred.)
2. On macOS/`overlay` systems the gutter is not consumed, so the 6px never appears and nothing
   shifts either way — `scrollbar-gutter` is a no-op there by spec.
3. Never animate a container's width to "make room" for a bar.

### 6.5 Contrast of the thumb (WCAG 1.4.11 does not require it — but 3:1 is cheap)

Custom-drawn scrollbars are author-supplied UI, and MDN's guidance is to keep thumb-vs-track at
**3:1**. Measured for this repo:

| State | Token | Composited over `--background` | Ratio |
|---|---|---|---|
| Rest (current) | fg `oklch(0.191 0.002 106.6 / 0.34)` | `#acaba8` | **2.18:1** |
| Hover (current) | same @ 0.50 | `#878784` | **3.44:1** |
| Rest to reach 3:1 | same @ **0.45** | `#91918e` | 3.00:1 |
| Dark rest (current) | white @ 0.30 | — | below 3:1; 0.34 is the floor |

Keeping the 2.18:1 rest state is defensible because the bar is decorative-at-rest and appears on
scroll — but it should be a written decision, not an accident. The 4px coarse-pointer thumb is
also below WCAG 2.5.8's 24px if treated as a target; it is not a target (touch uses swipe
anywhere in the region), and Roselli/​MDN both note scrolling is available by wheel, keyboard and
gesture regardless.

---

## 7. Platform-specific conventions

### 7.1 Touch targets — three competing minimums, pick the larger

| Standard | Minimum | Scope |
|---|---|---|
| Apple HIG | **44 × 44 pt** | iOS/iPadOS |
| Material | **48 × 48 dp** — "for most platforms, consider making touch targets at least 48 × 48dp" | Android; M3 adds "don't apply density by default… controls for adjusting density must maintain a target of at least 48×48" |
| WCAG 2.5.8 (AA) | **24 × 24 CSS px**, or a 24px-diameter spacing circle that touches nothing else | all pointer input |
| WCAG 2.5.5 (AAA) | **44 × 44 CSS px** | all pointer input |

EdApex rule: **44px floor everywhere, 48px on `pointer: coarse`.** `15-ui-surfaces.md` already
says "Touch targets are at least 44px at every size" — this just extends it to 48 on Android.
The row-actions `⋯` button is the case that matters: at a 52px row it must still be a 44×44 hit
area even though the glyph is 16–20px (Material's "an icon may appear 24×24 but padding makes the
full 48×48 target").

### 7.2 Destructive actions per platform

| Platform | Pattern | Rules that matter |
|---|---|---|
| **iOS** | **Action sheet** (`confirmationDialog`) | Apple: ≤ **4 buttons including Cancel**; **destructive first** ("place these at the top where they tend to be most noticeable"); Cancel at the bottom; *"Avoid letting an action sheet scroll"* — scrolling it invites mis-taps. Never use an alert where a choice set is wanted. |
| **Android** | **Confirmation dialog** / alertdialog | M3 bottom sheets are for richer contextual content, not a 3-option consequence decision. |
| **Desktop (Win/mac/Linux, Tauri)** | **Context menu** from `⋯`, plus a modal confirm for irreversible | Desktop menus carry the command taxonomy; the confirm is a modal because severity needs the dim. |
| **Web (all)** | Same three via a `<dialog>`/Radix primitive; choose by *input modality*, not by UA sniff | `(pointer: coarse)` → sheet; else → anchored menu. |

The taxonomy to encode once
(from the action-sheet / action-menu / bottom-sheet / confirmation-dialog comparison):

- **action sheet** = small choice set tied to a *just-initiated* action (share, save/discard);
- **action menu** (`⋯`) = the command list of a *resource* — EdApex's row menu: `View details`,
  `Generate claim link`, `Copy email`, `---`, `Revoke link`;
- **bottom sheet** = mobile contextual detail with detents (the person drawer on a phone);
- **confirmation dialog** = one consequence decision, destructive label naming the object.

So the EdApex row flow is: tap `⋯` → action menu → `Revoke link` → confirmation dialog naming
the person (`Revoke link for Amina Bello? The link stops working immediately.`). Not an action
sheet; there is only one consequence decision.

### 7.3 Safe-area insets

`env(safe-area-inset-*)` returns **0 unless `viewport-fit=cover` is set** in the viewport meta.
The four dynamic insets are joined in current specs by `safe-area-max-inset-*` (the *static*
maximum, for when a feature is retracted) and, on Android, `keyboard-inset-*` from the
VirtualKeyboard API.

**Already correct in this repo:** `apps/web/app/layout.tsx` exports
`viewport = { …, viewportFit: "cover" }`, so the insets are live and the existing `.safe-top` /
`.safe-bottom` helpers do work. The requirement is only that new edge-touching surfaces (the
mobile tab bar, sheet footers, the table card's inline margins) use them:

```html
<!-- what the framework emits; do not add a second meta tag by hand -->
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
```

```css
/* the mobile bottom tab bar and the sheet footer are the only places that need it */
.app-tabbar  { padding-block-end: max(8px, env(safe-area-inset-bottom)); }
.sheet-footer{ padding-block-end: max(16px, env(safe-area-inset-bottom)); }
.table-card  { margin-inline: max(16px, env(safe-area-inset-left)) max(16px, env(safe-area-inset-right)); }
```

The repo already has `.safe-top` / `.safe-bottom` helpers using `max(0.75rem, env(…))` — reuse
them rather than writing new ones, and make sure the meta tag has `viewport-fit=cover` or they
are inert.

### 7.4 Navigation, modals

- Navigation is not platform-forked: `1024px` is the single breakpoint (rail ↔ bottom bar),
  per `DESIGN.md`'s "exactly one breakpoint in that frame, not one per component". A 500px-wide
  desktop window gets the mobile shell deliberately.
- The **only** platform differences permitted on this surface: window chrome (already tokenised),
  the action-menu presentation (popover on desktop / sheet on touch), and haptics — which the
  WebView does not get, so nothing to build.
- Focus and dismissal behaviour must be identical everywhere: Escape closes, focus returns to
  the trigger, body scroll locks.

---

## 8. Accessibility for data tables

### 8.1 Markup skeleton

```html
<section aria-labelledby="people-h">
  <h2 id="people-h">Staff and parents</h2>

  <p id="people-desc" hidden>Sortable columns... </p>

  <div class="table-scroll" tabindex="0" role="region" aria-labelledby="people-cap">
    <table aria-labelledby="people-cap" aria-describedby="people-desc"
           aria-rowcount="581" aria-colcount="6">
      <caption id="people-cap">Directory, page 2 of 12</caption>
      <thead>
        <tr aria-rowindex="1">
          <th scope="col" aria-sort="ascending">
            <button type="button">
              <span>Name</span>
              <svg aria-hidden="true" focusable="false"><!-- filled ▲ --></svg>
            </button>
          </th>
          <th scope="col">Role</th>
          <!-- … -->
        </tr>
      </thead>
      <tbody>
        <tr aria-rowindex="51">
          <th scope="row">Amina Bello</th>
          <td>Staff</td>
          <!-- … -->
        </tr>
      </tbody>
    </table>
  </div>
</section>
```

The load-bearing details:

1. **`<caption>`** is the accessible name *and* the visible context. If it cannot be visible,
   `aria-labelledby` it from a visually-hidden node — not `aria-label` (it does not auto-translate;
   Roselli's repeated warning).
2. **`aria-sort` on exactly one `<th>` at a time**; omit the attribute entirely for unsorted
   columns rather than `aria-sort="none"`. ARIA has no way to express multi-key sort, so a
   two-column sort cannot be represented — pick one sort key or accept a lossy announcement.
3. **`aria-rowcount` / `aria-rowindex`** whenever pagination means the DOM does not hold every
   row — 581 records over 12 pages needs `aria-rowcount="581"` and a real `aria-rowindex` on
   **every** row including the header. Roselli's warning is blunt: inconsistent `aria-rowindex`
   "could cause screen reader table reading functions to skip rows or simply stop functioning".
4. **Row header, not just column headers.** `scope="row"` on the name cell is what makes a screen
   reader announce "Amina Bello, Status, Unclaimed" instead of "Unclaimed".
5. **Sortable header = a real `<button>` inside the `<th>`**, not an `onClick` on the `<th>`.
   Arrow `<svg>` gets `aria-hidden="true" focusable="false"`; the *direction* is carried by
   `aria-sort`, not by the glyph.

### 8.2 Announce what `aria-sort` does not

Measured by Roselli across six browser/AT pairs: NVDA+Firefox, JAWS+Chrome, Narrator+Edge and
VoiceOver+iPadOS **announce on sort**; **VoiceOver/macOS and TalkBack do not.** A `polite` live
region, cleared after ~1s (so a repeat sort in the same direction still announces), is the
practical patch:

```tsx
<p aria-live="polite" className="sr-only">{announcement}</p>
// on sort: setAnnouncement(`Sorted by ${label}, ${dir === "asc" ? "ascending" : "descending"}`)
// then setTimeout(() => setAnnouncement(""), 1000)
```

Same region announces the filter result count after a debounce — `47-performance-budgets.md`
already requires a **250ms** search debounce, which is the right moment to announce.

### 8.3 Keyboard

- **Do not turn the table into `role="grid"`.** Roselli: *"avoid ARIA grid roles for responsive
  tables … grids are interactive widgets, not data tables"*. A grid also collapses the tab
  sequence to one stop and then requires you to implement arrow-key navigation yourself.
- With a plain table, every focusable control is its own tab stop. With 50 rows × 2 controls
  (name link + `⋯`) that is 100 stops. **This is the argument for the drawer**: the row is
  reachable, the menu is reachable, and the rest of the row's actions live one level in.
- **Row actions keyboard path:** `Enter`/`Space` on `⋯` opens the menu; ↑/↓ move within it;
  `Escape` closes and returns focus to `⋯`; a destructive item is **never** the initially focused
  item.
- `:focus-visible` ring must be `2px` with `outline-offset: 2px` and **≥3:1** against its adjacent
  colour (WCAG 1.4.11 + 2.4.7). The repo's `--ring` gold on white is 4.93:1 ✅.

### 8.4 Focus management in the drawer/modal

The existing `components/ui/modal.tsx` already does the four correct things (Escape, focus-in,
focus-return, body-scroll lock, backdrop click check). Port the same four to whatever hosts the
drawer, and prefer a native `<dialog>` + `showModal()` where the primitive allows, because the
browser supplies: focus on first focusable, top-layer stacking, `Esc` closing only the last
dialog, `inert` on everything behind, and `::backdrop`. MDN lists exactly those as the things a
custom dialog "must replicate".

Two additions specific to a directory drawer:

- **Return focus to the row's `⋯`, not to the table.** If the row was re-sorted or filtered
  while the drawer was open, fall back to the table's scroll region.
- **Do not steal focus on inline updates.** After a successful revoke, the pill changes and the
  live region announces — focus stays on the control the admin used.

### 8.5 Reduced motion and contrast, briefly

`prefers-reduced-motion` coverage is §9. For contrast: pills must never be the **only** carrier
of state — the pill text says "Unclaimed", so colour is redundant and 1.4.1 is satisfied. The
selected-row left bar exists for the same reason.

---

## 9. Motion and reduced motion

### 9.1 What premium products actually do

- **Linear** moves the fewest things: tab indicators, panels, and a sidebar that dims. Its 2026
  refresh removed transitions along with borders rather than adding them.
- **Vercel/Geist** ships a **`no animation` skeleton variant** as a first-class prop — reduced
  motion is a *variant*, not a stylesheet override.
- **Both** treat reduced motion as "still show the state change, drop the travel".

### 9.2 The bug in the current approach

`apps/web/app/globals.css` ends with:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This is the common global kill-switch and it has three real problems:

1. **It kills opacity fades too.** The comment directly above it promises *"opacity still
   animates, transforms do not"* — but `transition-duration: 0.01ms` on `*` kills **every**
   transition including `opacity`, so a modal or drawer appears with a 0.01ms jump. The interface
   reads as broken rather than calm, which is the opposite of the intent. Vestibular triggers are
   *movement* (translate/scale/parallax), not *fades*.
2. It **overrides the more thoughtful local rules** earlier in the same file (the scrollbar fade
   `transition: none`, the skeleton `animation: none`), because `!important` on `*` outranks them.
   Those blocks still produce the right *outcome* by coincidence, but the file now says two
   contradictory things and the next author will copy the wrong one.
3. `components/ui/sheet.tsx` (shadcn default) uses `duration-300` closed / `duration-500` open —
   **neither matches `--motion-panel: 280ms` / `--motion-exit: 160ms`**. The drawer will feel
   sluggish against every other surface in the app until those two durations are re-pointed at
   the tokens.

### 9.3 The replacement

Keep the state change, remove the travel:

```css
@media (prefers-reduced-motion: reduce) {
  /* 1. No movement, no parallax, no scale. */
  *, *::before, *::after {
    animation-delay: 0ms !important;
    transition-property: opacity, background-color, border-color, color, box-shadow !important;
    scroll-behavior: auto !important;
  }

  /* 2. Fades get shorter, not instant. 80ms is felt as "settled", not as a jump. */
  *, *::before, *::after {
    transition-duration: 80ms !important;
    animation-duration: 80ms !important;
    animation-iteration-count: 1 !important;
  }

  /* 3. Sheets/modals appear in place instead of sliding. */
  [data-state="open"][data-sheet],
  [data-state="open"][data-modal] {
    transform: none !important;
  }

  /* 4. Loading affordances keep their shape, lose their sweep. */
  .skeleton-shimmer::after { animation: none; background-image: none; }

  /* 5. A sticky header is not motion, but a smooth-scrolling table is. */
  .table-scroll { scroll-behavior: auto; }
}
```

WCAG framing: **2.2.2 Pause, Stop, Hide** (A) applies to anything that moves for >5s — the
shimmer and any looping indicator. **2.3.3 Animation from Interactions** (AAA) is the one that
covers drawer slides; it is AAA, so reduced-motion support is a quality decision, not a
conformance gate — which is exactly why it should be done properly rather than as a
kill-switch.

---

## 10. Empty states and loading skeletons for tables

### 10.1 Mirror the resolved layout, or don't bother

Geist's rule is unambiguous: *"Set `width` and `height` to match the final content so the layout
doesn't shift when data resolves. A 200×20 block becoming an 80×16 string reads as a glitch."*
SaaSUI says the same thing from the other direction: *"a skeleton of placeholder rows that
matches the real layout rather than a centered spinner"*.

Concretely, the skeleton must share `--row-h`, the column template and the header height with
the real table. The current `DirectorySkeleton.tsx` does this **well** — same 9-column grid, same
`px-4 py-4` rhythm, same card chrome — but it duplicates the column widths as a hard-coded array
(`[72, 144, 192, 104, 88, 88, 88, 72, 88]`) with `min-w-[920px]` on the wrapper. That is the one
thing to change: derive both the skeleton and the table from **one** `grid-template-columns`
token, or the day a column is added the skeleton lies.

```css
/* one declaration, two consumers */
.people-grid { --cols: 40px minmax(180px, 1fr) 96px 120px 132px 44px; }
.people-table colgroup col { inline-size: … }         /* or: table-layout: fixed + widths */
.people-skeleton-row { display: grid; grid-template-columns: var(--cols); }
```

### 10.2 There are five empty states, not one

| State | Trigger | Copy pattern (Geist) | CTA |
|---|---|---|---|
| **First run** | no records ever | "No staff or parent records yet." + what will appear | `Add staff member` |
| **No results** | filter/search returned 0 | `No people match "bello". Clear the filter to see all 581 records.` | `Clear filters` |
| **Cleared** | work is done | "All claim links are resolved." | — |
| **Permission / tier** | role cannot view | full page when the route is blocked; a Note when one tile is gated | — |
| **Error** | fetch failed | "Couldn't load the directory." + **copyable request ID** | `Try Again` |

Rules that matter for this surface:

- **Distinguish empty from no-results.** Conflating them strands a user who simply over-filtered.
  The current `DirectoryTable` collapses both into "No staff or parent records match these
  filters." — it is right about "match", but it does not offer the clear-filter action.
- **Cap at one primary CTA** (+ one secondary when there are genuinely two paths). Three is a smell.
- **The CTA must be a real `<button>`/`<a>`**, never an `onClick` div, so it joins the tab order.
- **Quote the query verbatim in curly quotes** and state the total: `No people match “bello”.
  Clear the filter to see all 581 records.` The total is what tells the user the data is still there.
- **`aria-live="polite"` on the region** so the async filter change is announced.
- Empty states vanish when the list populates — so **never** put a persistent warning here.

### 10.3 Timing thresholds

| Threshold | Source | Implementation |
|---|---|---|
| **Do not show a skeleton for work under 150ms** | `47-performance-budgets.md` (team decision), already implemented in `AdminPage.tsx` via `setTimeout(() => setShowSkeleton(true), 150)` | keep it |
| Show stale data, not a skeleton, when a previous page exists | `47-performance-budgets.md` | keep it; add a subtle `opacity-60` + `aria-busy` on the table body during refetch |
| > 1s | NN/g | a visible busy state is now required — the 150ms delay no longer explains the wait |
| > 10s | NN/g | percent-done + an interrupt |

Shimmer only, never pulse (already a hard rule in `globals.css`), and reduced motion keeps the
block's shape while dropping the sweep.

### 10.4 Skeleton anatomy for this table

```
header:   [ ▁▁▁ 88px label ]                     [ ▁▁ 64px count ]
row ×6:   (○ 32px avatar) (▁▁▁▁▁ 140px · ▁▁▁▁▁▁ 180px) (▁▁▁ 64px) (▁▁▁▁ 88px pill) (▁ 20px)
footer:   [ ▁▁▁▁ count ]                         [ ▁▁ prev ] [ ▁▁ next ]
```

Every bar sits on the resolved element's box: the pill placeholder is `rounded-full h-6` (matching
`Badge` at 24px), the avatar is a `rounded-full` 32px circle, text bars are 4px–5px tall at the
line's cap height, and the row height is `var(--row-h)`. That is why it must read the same token —
not a hard-coded `py-4`.

---

## 11. Method for the computed numbers

Every ratio in §2.4 and §6.5 was produced by script, from this repo's own token values, so the
result is reproducible and auditable rather than eyeballed:

1. OKLCH → OKLab → LMS → linear sRGB (Björn Ottosson's conversion matrices), clamped to [0,1].
2. Linear sRGB → gamma-encoded sRGB; WCAG relative luminance
   `L = 0.2126 R + 0.7152 G + 0.0722 B` on the *linearised* channels.
3. Contrast `(L₁ + 0.05) / (L₂ + 0.05)`, unrounded before comparison (WCAG: 2.999:1 does not meet 3:1).
4. Translucent backgrounds: alpha-composited over the resolved card colour first, then measured.
5. Ink lightness was solved by bisection — the lightest `L` at a fixed `C`/`H` that still reaches
   4.5:1 on a 12%-self-tint over the card.

Representative intermediates, for spot-checking: `--background` = `#faf9f5`, `--card` = `#ffffff`,
`--muted` = `#f5f0e8`, `--border` = `#e6dfd8`, `--muted-foreground` = `#6c6a64`, `--success` =
`#2b7440`, `--warning` = `#9a6500`, `--destructive` = `#c64545`, `--primary` = `#b3543b`; dark
`--background` = `#181715`, `--card` = `#252320`.

Two byproducts worth recording because they are *not* failures:

- `--border` on card is **1.32:1**. Row dividers are decorative, not the control boundary, so
  1.4.11 does not apply — this is the "thin grey borders" look working as intended. But an
  `<input>` border at 1.32:1 **would** fail 1.4.11; `--input` must stay ≥3:1 (a neutral around
  `oklch(0.66 0.012 70)` measures 3.12:1 if the input needs a visible outline in a redesign).
- Row hover at 1.08:1 is deliberate — hover is never required to be perceivable (WCAG: "additional
  author-supplied visual treatments for hover are not 'required to identify' the hover state").

---

## 12. Implementation checklist

Ordered so each step is shippable alone.

- [ ] Add `--warning-ink` / `--destructive-ink`; switch `Badge`'s warning/destructive variants to
      them. Verify with a script, not by eye (§2.4).
- [ ] `components/ui/table.tsx`: replace `h-10` / `p-3` with `--row-h` / `--row-pad`; header
      4px shorter than body; `tabular-nums` on numeric cells.
- [ ] Sticky `thead` with `border-collapse: separate`, opaque background, `box-shadow` hairline (§3.6).
- [ ] `scrollbar-gutter: stable` on `.table-scroll` and every `.scrollbar-auto` container.
- [ ] Rework `globals.css` scrollbars to strategy **B** — pseudo-elements under
      `@supports selector(::-webkit-scrollbar)`, `scrollbar-width` only in the `not` branch (§6.3).
- [ ] `@container people (width < 40rem)` → card list; one fetch, two trees; subgrid for card columns (§4).
- [ ] Drawer for inspection, modal for destructive, action menu on `⋯`; 44px targets, 48px coarse (§7.2).
- [ ] Table a11y pass: `<caption>`, `scope="row"`, `aria-sort` on one header, `aria-rowcount` +
      `aria-rowindex`, sort buttons, polite live region for sort and filter (§8).
- [ ] Replace the global `prefers-reduced-motion` kill-switch with the property-scoped version (§9.3).
- [ ] Five empty states + a skeleton driven by the same `--cols` token as the table (§10).
- [ ] Confirm edge-touching surfaces consume the existing `.safe-*` helpers — `viewportFit: "cover"`
      is already set in `app/layout.tsx` (§7.3).

---

## Sources

Published specs and docs

- [Data table — Carbon Design System (specifications, updated 2026-09-30)](https://www.carbondesignsystem.com/building-blocks/core/components/data-table/specifications)
- [Table — Vercel Geist](https://vercel.com/geist/table) · [Typography](https://vercel.com/geist/typography) · [Empty State](https://vercel.com/geist/empty-state) · [Skeleton](https://vercel.com/geist/skeleton) · [Drawer](https://vercel.com/geist/drawer) · [Tabs](https://vercel.com/geist/tabs)
- [Data Grid — Row height — MUI X](https://mui.com/x/react-data-grid/row-height/)
- [Easing and duration — Material Design 3](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs) (token values via the [snapshot of the same page](https://raw.githubusercontent.com/Glavo/md3-reference-hub/main/docs/styles/motion/easing-and-duration/tokens-specs.md))
- [Tabs — M3 specs](https://m3.material.io/components/tabs/specs) and [Lists — M3 specs](https://m3.material.io/components/lists/specs) (token tables via [md3-reference-hub](https://github.com/Glavo/md3-reference-hub))
- [Accessibility designing — Material Design 3](https://m3.material.io/foundations/designing/structure)
- [Action sheets — Apple HIG](https://developer.apple.com/design/human-interface-guidelines/action-sheets) (text via [the v19 mirror](https://appstoreguidelines.com/human-interface-guidelines/version/19/action-sheets/))
- [List — Raycast API](https://developers.raycast.com/api-reference/user-interface/list)
- [Table Pattern — W3C WAI-ARIA APG](https://www.w3.org/WAI/ARIA/apg/patterns/table/) · [Grid Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/) · [Grid and Table Properties](https://www.w3.org/WAI/ARIA/apg/practices/grid-and-table-properties/)
- [WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) · [SC 2.5.5 (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) · [SC 1.4.10 Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) · [SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) · [SC 1.4.12 Text Spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html)
- [scrollbar-width — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-width) · [scrollbar-color](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-color) · [scrollbar-gutter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-gutter) · [::-webkit-scrollbar](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/::-webkit-scrollbar)
- [Scrollbar styling — Chrome for Developers](https://developer.chrome.com/docs/css-ui/scrollbar-styling)
- [CSS scrollbar styling — Can I use](https://caniuse.com/css-scrollbar)
- [env() — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/env)
- [Container queries — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries) · [Subgrid — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Subgrid) · [content-visibility — MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility) · [`<dialog>` — MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)
- [Styling Scrollbars — WebKit](https://webkit.org/blog/363/styling-scrollbars/)

Product design notes

- [How we redesigned the Linear UI (part Ⅱ) — Linear, 2024](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [A calmer interface for a product in motion — Linear, 2026](https://linear.app/now/behind-the-latest-design-refresh)
- [Designing accessible color systems — Stripe](https://stripe.com/blog/accessible-color-systems)

Articles

- [SaaS Data Table & List View UX Patterns (2026) — SaaSUI](https://www.saasui.design/blog/saas-data-table-ux-patterns)
- [SaaS Metric & KPI Card UX Patterns (2026) — SaaSUI](https://www.saasui.design/blog/saas-metric-kpi-card-ux-patterns)
- [Dashboard Data Density Patterns — Art of Styleframe (2026)](https://artofstyleframe.com/blog/dashboard-data-density-patterns/)
- [Modal vs. Separate Page: UX Decision Tree — Smashing Magazine (2026)](https://www.smashingmagazine.com/2026/03/modal-separate-page-ux-decision-tree/)
- [Action sheet vs Action menu vs Bottom sheet vs Confirmation dialog — UX Patterns Guide](https://uxpatternsguide.com/compare/action-sheet-vs-action-menu-vs-bottom-sheet-vs-confirmation-dialog/)
- [Response Times: The 3 Important Limits — NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [Under-Engineered Responsive Tables — Adrian Roselli (updated 2026-10-05)](https://adrianroselli.com/2020/11/under-engineered-responsive-tables.html)
- [Sortable Table Columns — Adrian Roselli (updated 2026-10-14)](https://adrianroselli.com/2021/04/sortable-table-columns.html)
- [Talkin' Tables at A11yTO Conf — Adrian Roselli (2025)](http://adrianroselli.com/2025/10/talkin-tables-at-a11yto-conf.html)
- [What is Attio CRM? Design style guide — Curio (2026)](https://designbycurio.com/learn/attio-2024)
- [Scrollbars Chrome update 121 — Stack Overflow](https://stackoverflow.com/questions/77919700/scrollbars-chrome-update-121)
- [Chrome Overlay Scrollbars / `overflow: overlay` removal — Stack Overflow](https://stackoverflow.com/questions/76383750/chrome-overlay-scrollbars-not-following-default-behavior-why)
