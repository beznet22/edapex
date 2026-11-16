# 82 — Package boundaries

Status: Normative.

The React surface lives in more than one app. That was not true until the Android app
arrived, and the drift it caused — twenty primitives, the whole design system and the host
seam all inside `apps/web` — is what this spec exists to prevent from returning.

## 1. The dependency graph

```
apps/web ─┐
          ├─→ packages/* ─→ (nothing)
apps/desktop/mobile ─┘
          └─→ crates/*   (through Tauri only)
```

One-way. A package never imports an app; an app never imports another app. Enforced by
`scripts/check-boundaries.mjs`.

## 2. What lives where

| Package | Contains | May not contain |
|---|---|---|
| `@edapex/tokens` | `tokens.css`: palettes, accents, `@theme`, base layer, scrollbars, keyframes | any JS; any selector depending on a route or a window |
| `@edapex/ui` | shadcn primitives, `cn`, the enter/exit animation sheet | `next/*`, `@tauri-apps/*`, data fetching, app chrome |
| `@edapex/host` | transport, API, capability guards, agent adapter, native transport | `next/*`; `@tauri-apps/*` outside `./agent/native` |
| `@edapex/chat` | runtime state machine, Markdown primitives | host APIs |
| `@edapex/contracts` | wire types and their guards | runtime behaviour |

What stays in an app: routing, shell chrome, surfaces, and anything host-specific.
`apps/web/lib/native-agent.ts` (the browser delivery of `crates/agent`),
`apps/web/lib/runtime-connect.ts` (the web app's transport *choice*) and
`apps/web/lib/agent-host.ts` (its policy) are all app decisions, not seam.

## 3. How to add something

- **A primitive** → `pnpm dlx shadcn@latest add <name>` from the app that needs it. The CLI
  routes it to `packages/ui`. Modify by token; never fork the API.
- **A surface** → stays in the app. Two apps needing it is a signal that it is two
  surfaces, or that the shared part is smaller than it looks.
- **A host capability** → `packages/host`, with a subpath export if it pulls a host API.
- **A design value** → `packages/tokens/tokens.css`, and nowhere else.

## 4. Subpath exports, not a barrel

`@edapex/host/agent/native` exists so the web bundle never resolves `@tauri-apps/api`. A
single `index.ts` re-exporting everything would put a Tauri import in the browser graph and
make the boundary untestable. Package entries are re-exports only and capped at 40 lines for
the same reason: logic in a barrel is invisible to the checks.

## 5. Enforcement

| Check | Fails on |
|---|---|
| `scripts/check-boundaries.mjs` | app→app import, package→app import, `@/` alias in a package, `next`/Tauri in `packages/ui`, Tauri in the agent seam, JS in `packages/tokens`, banned filename stems, a package entry with logic, a test outside `tests/`/`e2e/`/`src/` |
| `scripts/check-tokens.mjs` | a new arbitrary Tailwind value; a baseline that could be lowered |
| `scripts/check-docs.mjs` | a package missing from the `AGENTS.md` map, a broken spec link, a spec without `Status:`, a package-name mismatch, an uncovered workspace directory |

All three run from `pnpm check` and in CI. Each was proven to fail on a deliberate
violation before it was trusted.

## 6. The migration record

| Commit | What moved | Proof it was a move |
|---|---|---|
| `refactor(tokens)` | `globals.css` → `@edapex/tokens` | built stylesheet byte-length identical (109,962), same 509 custom properties and 1,258 selectors as multisets |
| `feat(ui)` | registry → `packages/ui` | 37 components installed by the CLI; `apps/web` unchanged until the next commit |
| `refactor(ui)` | `apps/web` imports → `@edapex/ui` | 16 local copies deleted; `tsc` and the 120-test suite pass |
| `refactor(host)` | `apps/web/lib` → `@edapex/host` | 11 modules moved with `git mv`; the only behavioural change is transport injection |
