# 51 — Settings surface

**Draft.** New surface for the workspace. Owns the settings navigation tree, the row-based
settings layout, and the appearance controls. It does not own the design tokens
(`19-design-system.md`), the shell geometry (`15-ui-surfaces.md`), or the auth flows
(`04-auth-identity.spec.md`).

## Why a separate navigation tree

The workspace rail has three destinations today (Chat, Tasks, Make). Settings adds
around ten, and a flat rail cannot hold thirteen items without becoming a menu.

The reference pattern — ChatGPT's settings — solves this by **swapping the sidebar's
content, not extending it**. Entering settings replaces the workspace items with a
settings tree and adds a "Back to app" affordance. The rail's *width* does not change;
its *contents* do.

That is the decision this spec records: **one sidebar, three content trees.**

| Context | Tree | Header |
|---|---|---|
| Workspace | Chat, Tasks, Make, Plugins | Brand + collapse trigger |
| Settings | Profile, Account, App, Data & Privacy groups | "Back to app" + search |
| Plugins | Workspace tree, with Plugins active | Brand + collapse trigger |

Only settings replaces the tree. Plugins is a workspace destination, so it keeps the
workspace tree — matching the reference, where the Plugins page still shows New chat,
Library and Recents.

## Motion

The tree swap animates; the rail width does not. A width animation would move the entire
content column, which on a 760px canvas is a visible reflow. Instead:

- Outgoing tree: `opacity 1 → 0`, `translateX(0 → -8px)`, `160ms`, `--ease-exit`
- Incoming tree: `opacity 0 → 1`, `translateX(8px → 0)`, `220ms`, `--ease-enter`
- The two do not overlap. A cross-fade at this size reads as a blur.

Under `prefers-reduced-motion: reduce`, both become an instant swap. The content change
is information; the slide is decoration.

`--ease-exit` is faster than `--ease-enter` on purpose: leaving feels responsive,
arriving feels considered. Reversing it makes navigation feel sluggish.

## Layout

Settings is a **row-based** page, not a card grid:

```
Page title (22px, 600)
Subtitle (13px, muted)

Section label (13px, 600)
─────────────────────────────────────────────  ← hairline
Row
  Label (14px, 500)              control
  Description (13px, muted)
─────────────────────────────────────────────
Row
  ...
```

- Rows are 1px-hairline separated, **not** individually carded. Ten bordered cards in a
  column is a stack of boxes; hairlines read as one table.
- The control sits right-aligned, vertically centred on the label, not the row.
- Descriptions wrap under the label at `max-w-[52ch]`.
- Section headings are separated by `32px`; rows by a hairline.
- The whole column is `max-w-[720px]` and left-aligned, not centred. Centred settings
  pages make the eye travel to find the label column.

## Rows in scope

**Profile** — display name, the account's email (read-only), role.

**Appearance** — colour mode (light / dark / system), accent preset.

**Workspace** — the current academic context, workspace identifier (read-only, for
support).

Out of scope for v1: notifications, voice, keyboard, billing, data export. They appear in
the tree only when they exist — an entry that opens an empty page is worse than an absent
one.

## Colour mode control

Three options, shown as **previews**, not a segmented control. The reference uses three
miniature app thumbnails because "light" and "dark" mean nothing until you see them, and
a segmented control of the words is a riddle for anyone who has not met the concept.

The previews are drawn from our own tokens (`--background`, `--card`, `--border`) so they
cannot drift from the app's actual appearance. Each is a 44×32 rounded rectangle with six
abstract lines.

Selected state: a 2px `--ring` outline plus `--ring-offset`, meeting the same focus
contract as every other control.

## Relationship to the theme cookie

The existing `edapex.theme` and `edapex.accent` cookies remain authoritative. This surface
is a second control over the same state, not a second source. Both read
`ThemeProvider`'s context; neither writes its own storage.

That matters because the server reads the cookie during render to put the class on
`<html>`. A settings page that wrote localStorage would produce a flash the cookie path
was built to avoid.

## Accessibility

- Groups are `<fieldset>` with `<legend>` rendered as the section label — a screen reader
  announces "Appearance, group" rather than reading twelve orphaned rows.
- Each row's control is labelled by its own label element, not by `aria-label` alone:
  the visible text is the name.
- The mode previews are a `radiogroup`, arrow-key navigable, with `aria-checked`.
- "Back to app" is the first focusable element in the tree, so a keyboard user can leave
  settings in one Tab from the top.

## Non-goals

- Per-tenant accent editing. The presets are fixed; a tenant chooses one, not builds one.
- A settings search box in v1. With three sections and seven rows, the field would be
  larger than the content it searches.
