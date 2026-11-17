# @edapex/ui

shadcn primitives, shared by `apps/web` and `apps/desktop/mobile`.

## Rule: install with the CLI, never by hand

```bash
cd apps/web
pnpm dlx shadcn@latest add button
```

The CLI reads `apps/web/components.json`, sees `aliases.ui` pointing at
`@edapex/ui/components`, and writes the component into this package — then rewrites the
app's imports. Running `add` from inside `packages/ui` also works, using the package's own
`components.json`.

Everything in `src/components/` therefore arrives from the registry. A hand-written
primitive here is a bug: the point of this package is that the next `shadcn add` does not
have to be reconciled with a local fork.

## Rule: modify by token, not by fork

After `add`, a component may change:

1. palette and scale classes → token utilities (`bg-card`, `text-muted-foreground`,
   `rounded-[var(--radius-md)]`);
2. CVA variants, keeping the existing variant names;
3. mobile hit-area (`after:-inset-*`) and safe-area padding where the primitive is a touch
   target.

It may **not** change its exported API, its `data-slot` attributes, Radix composition
(`asChild`) or its accessibility wiring. A component whose behaviour the registry cannot
express is *composed* from primitives, not rewritten.

## The three exceptions

Components with no registry parent, each composed from primitives and listed here so the
exception list cannot grow quietly:

| Component | Why it exists |
|---|---|
| camera gesture layer (`apps/desktop/mobile`) | a native preview needs a native overlay; the WebView draws only the chrome |
| PDF canvas (`apps/desktop/mobile`) | a `<canvas>` renderer has no primitive equivalent |
| message grouping (`apps/desktop/mobile`) | `Bubble` renders one message; grouping consecutive parts is app logic, not a primitive |

## Configuration invariants

- `style`, `baseColor` and `iconLibrary` must match `apps/web/components.json` and
  `apps/desktop/mobile/components.json`. Divergence is how a registry ends up with two
  visually different buttons.
- `tailwind.css` points at `../tokens/tokens.css`. The CLI writes CSS variables into
  whichever file that names, and the token sheet is the only file allowed to receive one.
- `tailwind.config` is empty: Tailwind v4 is CSS-first.

## What stays in an app

`apps/web/components/ui/sidebar.tsx` and `command.tsx` are shell chrome, not primitives —
the sidebar is a persistent desktop rail with cookie state and a keyboard shortcut, and the
command palette is a web-only surface. Neither belongs in a package that an Android WebView
imports.

## Composed here, not vendored

Two components the registry does not publish for the `new-york` style. Both are composed
from registry primitives and follow the AI Elements API, so the patterns above them can be
copied in unchanged.

| Component | Built from | Why not vendored |
|---|---|---|
| `trace` | `Collapsible` | `shadcn add trace` answers 404 on `new-york-v4`; the pattern is a documented composition of a trigger and its content |
| `confirmation` | `Alert`, `Button` | Same — a confirmation is an alert with two actions and a resolved state |
| `reasoning` | `Trace` | A reasoning row is a trace row that opens on itself while it streams |
| `tool-call` | `Trace` | A tool row is a trace row whose title is a verb and whose detail is the output |
