---
version: alpha
name: EdApex Gold on Slate
description: "One design system for two hosts: a calm, warm-gold school operations workspace rendered in a browser tab and in a frameless desktop window."
colors:
  background: "oklch(0.985 0.003 255)"
  foreground: "oklch(0.24 0.018 255)"
  card: "oklch(1 0 0)"
  surface-soft: "oklch(0.955 0.006 255)"
  on-surface-muted: "oklch(0.5 0.018 255)"
  outline: "oklch(0.9 0.008 255)"
  primary: "oklch(0.62 0.12 74)"
  primary-strong: "oklch(0.78 0.13 78)"
  on-primary: "oklch(0.99 0.01 80)"
  destructive: "oklch(0.55 0.19 27)"
  dark-background: "oklch(0.15 0.012 255)"
  dark-surface: "oklch(0.19 0.014 255)"
  dark-on-surface: "oklch(0.92 0.01 255)"
  dark-on-surface-muted: "oklch(0.67 0.02 255)"
  dark-outline: "oklch(0.31 0.02 255)"
  dark-primary: "oklch(0.78 0.13 78)"
  shell-hairline-light: "oklch(0.24 0.02 255 / 0.06)"
  shell-hairline-dark: "oklch(1 0 0 / 0.10)"
typography:
  surface-title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  chrome:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: "0px"
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "20px"
  pill: "9999px"
spacing:
  base: "4px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
  "3xl": "48px"
  rail-width: "72px"
  chat-measure: "760px"
  artifact-min-editor: "360px"
  artifact-min-preview: "480px"
  titlebar-height: "32px"
  macos-traffic-light-inset: "78px"
shadows:
  elevation-1: "0 1px 2px oklch(0.24 0.02 255 / 0.06)"
  elevation-2: "0 2px 8px oklch(0.24 0.02 255 / 0.08)"
  elevation-3: "0 8px 28px oklch(0.24 0.02 255 / 0.12)"
components:
  titlebar:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.chrome}"
    height: "{spacing.titlebar-height}"
  titlebar-button:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.sm}"
    height: "100%"
    width: "44px"
  titlebar-button-hover:
    backgroundColor: "{colors.surface-soft}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  composer:
    backgroundColor: "{colors.card}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.lg}"
  nav-item-active:
    backgroundColor: "color-mix(in oklch, {colors.primary} 15%, transparent)"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  nav-item-active-dark:
    backgroundColor: "color-mix(in oklch, {colors.dark-primary} 20%, transparent)"
    textColor: "{colors.dark-primary}"
    rounded: "{rounded.md}"
  surface-dark:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.lg}"
    padding: "{spacing.xl}"
  surface-dark-muted:
    backgroundColor: "{colors.dark-surface}"
    textColor: "{colors.dark-on-surface-muted}"
    rounded: "{rounded.lg}"
  window-edge:
    # The hairline that separates the frameless window from the desktop behind it.
    backgroundColor: "{colors.shell-hairline-light}"
    rounded: "{rounded.none}"
  window-edge-dark:
    backgroundColor: "{colors.shell-hairline-dark}"
    rounded: "{rounded.none}"
  page-dark:
    backgroundColor: "{colors.dark-background}"
    textColor: "{colors.dark-on-surface}"
    rounded: "{rounded.none}"
  divider-dark:
    backgroundColor: "{colors.dark-outline}"
    rounded: "{rounded.none}"
  metadata:
    textColor: "{colors.on-surface-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
  destructive-action:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.sm}"
  primary-emphasis:
    # `primary-strong` is the lighter dark-mode gold. White on it is 1.97:1, so
    # this pairing uses the dark slate instead — the same reason a highlighted
    # gold chip in dark mode carries dark text rather than white.
    backgroundColor: "{colors.primary-strong}"
    textColor: "{colors.dark-background}"
    rounded: "{rounded.sm}"
---

## Overview

EdApex Work is a school operations and cowork workspace that people keep open for
hours. The aesthetic serves sustained attention rather than first impressions: calm
neutrals, one accent, and hierarchy carried by typography and elevation instead of
frames and rules.

The emotional target is **competent and quiet**. A deputy head should be able to
scan a marksheet, approve an outgoing parent message, and answer a colleague
without the interface competing for attention. It is not playful, not futuristic,
and deliberately not "AI product" — no gradients on chrome, no glow, no
glassmorphism for its own sake.

Light mode is the default, because most school work happens in daylight on a
laptop. Dark mode is a real theme, not an inverted filter; both palettes are
defined explicitly so neither is derived from the other.

## Colors

The palette is warm gold on slate: a single accent against cool neutrals.

- **Background:** near-white with a trace of blue. Reads as paper, not glass.
- **Foreground:** deep slate rather than black. Black on white is harsher than a
  screen needs and makes long transcripts tiring.
- **Primary (gold):** reserved. One primary action per view, plus the active
  navigation state and focus rings. It is the only saturated colour in the
  interface, which is why it reads as meaningful.
- **Muted foreground:** metadata, timestamps, helper text — everything that should
  be findable but not read first.
- **Destructive:** a desaturated red, used only for irreversible actions. It is
  never used to indicate an error the person did not cause.

Accent choice is per tenant (gold, jade, indigo), so the accent is a token in the
same way the theme mode is. Tenant colour never changes the neutral scale.

## Typography

Three sizes, and a fixed rule about why.

- **22px / 600** — surface titles only. One per view.
- **15px / 400** — body, transcript, composer. Sized for paragraphs, not tables.
- **13px / 500** — chrome, labels, metadata.

The ratio is deliberately compressed. A frameless window with six type sizes reads
as noisy precisely because nothing else delimits content; with three sizes and two
weights, spacing does the separating and the eye has somewhere to rest.

System sans throughout. A bespoke face would cost a network request on first paint
for a product whose value is speed, and would not survive the WebView floor.

## Hosts

The same interface ships in two hosts, and the design must hold in both without
being two designs.

| | Browser tab | Desktop window |
|---|---|---|
| Chrome | The browser's own | Ours: frameless, 32px titlebar |
| Window edge | None — the tab is the edge | 1px hairline, 10px radius floating |
| Focus signal | The OS dims the tab | We dim the titlebar to 60% |
| Scroll container | The document | The content pane, below a fixed titlebar |
| Minimum viewport | 320px | 360×640 |
| Install affordance | PWA prompt | Installed |

**The rule that keeps them one system:** every host-specific difference is a
token resolved at the edge of the app, never a forked component. The transcript,
composer, cards, pills and dashboards are identical in both hosts. What changes is
the frame around them — and there is exactly one breakpoint in that frame, not one
per component.

**What must never differ:** typography, spacing, colour, elevation, radii, motion
durations. If a value needs to be different on desktop, the design is wrong, not
the token.

**Titlebar is additive, not a variant.** In a browser tab it renders nothing at
all — not a hidden element, not a spacer. A fake titlebar inside a tab would
duplicate chrome the browser already draws, and a reserved band of empty space
would be worse: it would shift every surface down for no reason.

## Layout & Spacing

A 4px base scale, with 12px as the default control gap and 24px as the default
section rhythm.

- **Chat is measured, dashboards are not.** The transcript caps at 760px so lines
  stay readable; Tasks and Make use the full width in bento grids.
- **The rail is 72px** on desktop and collapses to a bottom bar below 1024px.
- **Artifacts split 38/62** on desktop, with 360px and 480px minimums so neither
  the editor nor the preview collapses. Below 1024px it becomes a sheet instead.
- Nothing is pinned to a phone width on a desktop viewport. That was a real defect
  once; the responsive suite now asserts no horizontal overflow at seven widths.

**Breakpoints are the same in both hosts**, because a narrow desktop window and a
phone browser are the same layout problem:

| Width | Shell |
|---|---|
| < 1024px | Bottom tab bar, single column, artifact as a sheet |
| ≥ 1024px | 72px rail, chat measure 760px, artifact split 38/62 |

A desktop window resized to 500px gets the mobile shell, deliberately: a
min-width of 360px means the window can genuinely be that narrow, and pretending
otherwise would overflow.

## Elevation & Depth

**Depth replaces borders.** This is the load-bearing decision of the whole system.

Panels separate with tint and shadow, not `border-r`. A shell that draws a line
between every region reads as a grid of boxes; the same shell with two elevation
levels reads as layers. Where a hairline survives it is 1px at 6% opacity in light
and 10% in dark — enough to exist, never enough to notice.

Shadows are three levels and no more, all warm-tinted from the foreground colour
rather than pure black, because grey shadows on a warm-neutral surface read as
dirty.

## Shapes

Controls at 10px, cards at 14px, pills fully rounded. Chrome panels are square at
the macro level with rounding reserved for interactive elements inside them.

The window itself is 10px when floating and square when maximised, matching the
platform's own behaviour.

## Components

### Window chrome

Frameless. macOS keeps its native traffic lights via a transparent titlebar;
Windows and Linux get custom controls, and the Windows maximise button keeps its
Snap Layouts flyout because it is a real system button.

The titlebar is 32px. It dims to 60% opacity when the window loses focus — the one
signal that makes an undecorated window feel like an application rather than a
browser view, and something the OS cannot do for us once decorations are off.

### Composer

Frosted glass from `md` upward only. On a phone the blur costs more than it gives,
because the compositor has to re-blur while the software keyboard resizes the
viewport.

### Tool activity

Pills, not rows. A grouped line summarises what happened and expands into ordered
steps; a needed decision is never hidden inside a disclosure, because the person is
the thing the turn is waiting for.

## Do's and Don'ts

- Do let spacing and typography separate content before reaching for a border.
- Do keep gold to one primary action per view.
- Do define light and dark palettes explicitly; never derive one from the other.
- Do make every motion respect `prefers-reduced-motion`.
- Do keep dashboard surfaces wide and the chat measure narrow.

- Don't use a hard border to divide two panels; use elevation.
- Don't put a scale transform on a toolbar control — it reads as a web page.
- Don't pin a desktop surface to a phone width.
- Don't add a fourth type size to solve a hierarchy problem; fix the spacing.
- Don't use a drop shadow on the window itself; the OS already draws one.
