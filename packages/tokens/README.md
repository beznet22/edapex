# @edapex/tokens

Gold on Slate, as CSS. The single source of every design value in the repository.

## What it is

One stylesheet — `tokens.css` — containing:

- `:root` (light) and `.dark` palettes
- the five `[data-accent]` presets, light and dark
- the system-mode mirror, so a dark-OS user never sees a flash before hydration
- `@theme inline`, which maps the raw variables onto Tailwind's namespaces
- the base layer: border reset, body typography, focus ring, selection
- the scrollbar system and `.skeleton-shimmer`
- the tinted badge classes, elevation utilities, safe-area helpers, `.stream-tail`
- keyframes and the motion utilities

## What it is not

- Not a JS package. There is no `index.ts`, no build step, no dependency. A `.ts` file here
  is a bug: it would let a component decide a design value.
- Not a component library. That is `@edapex/ui`.
- Not host-aware. No selector here may depend on a route, a shell or a window. Web-only rules
  live in `apps/web/app/globals.css`; mobile-only values are additive `@theme` blocks in
  `apps/desktop/mobile`.

## How it is consumed

```css
@import "tailwindcss";
@import "@edapex/tokens/tokens.css";
```

Both hosts import it before their own rules. The Android app's `components.json` points its
`tailwind.css` field at this file, so `shadcn add` can only ever write a design value here.

## Changing a value

Change it here and nowhere else. A second definition in an app is a fork, and the token
parity test in `apps/web/e2e/workspace.spec.ts` exists because the light, dark and system
palettes have drifted before.

`DESIGN.md` is the prose authority; this file is the machine-readable one. Both are checked —
`pnpm dlx @google/design.md lint DESIGN.md --max-warnings 0` catches a token the prose does
not mention, or a prose claim the tokens do not satisfy.

## Known duplication, kept deliberately

`--radius-sm|md|lg|xl` are declared twice inside `@theme inline`; the second set wins, so the
effective ladder is `4 / 7 / 10 / 16 / 24px` rather than the `:root` ladder. This was carried
over verbatim from `apps/web/app/globals.css` so the move would be provably output-identical.
Resolving it changes every corner in the product and is therefore a separate, visual-reviewed
change — not part of an extraction.
