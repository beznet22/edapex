# Agent Instructions — EdApex workspace

This repository holds **two systems** during the migration. Know which one you are
in before changing anything.

| Path | What | Status |
|---|---|---|
| `legacy/` | SvelteKit + Mastra monolith | **Serves production today.** Own instructions: [`legacy/AGENTS.md`](legacy/AGENTS.md) |
| `apps/web` | Workspace web app (vinext + React) | The replacement surface |
| `apps/desktop` | Tauri desktop and mobile shell | New |
| `services/` | `sms-api`, `cowork-api`, `model-router` | New, Cloudflare Workers |
| `packages/` | `contracts`, `chat`, `genui`, `documents`, `connectors` | New, shared TypeScript |
| `crates/` | `agent`, `agent-wasm`, `store`, `ocr`, `core` | New, Rust |
| `docs/` | `cloudflare-port`, `workspace`, `desktop`, research | New |
| `scripts/` | New-system tooling only | New |

New code goes in `apps/`, `services/`, `packages/` or `crates/`. Never add to
`legacy/` except to keep production working. A change that has to touch both trees is
a migration step, not a refactor — say so in the PR.

## Package Manager & Scripts

Use **pnpm** from the repository root: `pnpm install`, `pnpm --dir apps/web dev`.
Run anything not installed globally with `pnpm dlx` (or `pnpx`). Do not assume a
global binary exists.

`legacy/` is a **standalone pnpm project** with its own `pnpm-workspace.yaml` and
lockfile, and no `@edapex/*` dependency. A root install must not reach into it.

# Code Quality Constraints (NON-NEGOTIABLE)

- **Absolute Production Readiness**: Write complete, production-ready code.
- **No Placeholders**: Never write `// implementation goes here` or
  `// TODO: add validation`. Execute the full implementation.
- **No Instructional Comments**: Do not explain what the code obviously does. Comment
  only trade-offs and constraints a reader could not infer.
- **Complete End-to-End**: If a task needs a schema change, a repository method and a
  route, do all three. Half-finished work is a failure.

## TypeScript Type Safety (NON-NEGOTIABLE)

Every line must be **fully type-safe**. Loose types erode correctness silently.

### Banned Types

| Type | Why | Use Instead |
|---|---|---|
| `any` | Disables all checking | A concrete type, a bounded generic, or `unknown` + a guard |
| `never` (as annotation) | Masks unreachable logic bugs | Exhaustive `switch`; let TS infer `never` |
| `object` | Too broad | A specific interface or `Record<K, V>` |
| `Function` | Untyped callable | `(...args: A) => R` |
| `{}` | Matches any non-nullish | A named interface |

### Required Practices

- **Utility types over rewriting**: `Omit`/`Pick`/`Partial`/`Required`/`Readonly` from
  a single source of truth.
- **Infer from Zod**: `z.infer<typeof schema>`; never duplicate the interface.
- **Explicit return types** on every exported function, server action and handler.
- **Const assertions** for fixed string unions and config objects.
- **Strict generics**: constrain every parameter (`<T extends Base>`).
- **No `as` casts.** Use type guards (`is`), assertion functions (`asserts x is T`) or
  `satisfies`. The only exception is `as const`.
- **Discriminated unions** for variants — never optional "sometimes present" fields.
- **Narrow index signatures**: `Record<SpecificKey, V>` over `Record<string, V>`.
- **Typed event handlers**: framework event types, never `(e: any) => void`.
- **`catch` narrows `unknown` immediately.** Never `catch (e: any)`.
- **No `@ts-ignore` / `@ts-expect-error`.** Wrap a genuinely wrong third-party type in
  a thin typed adapter and say why.

Verify with `pnpm --dir <package> run typecheck` after every change. Zero errors is
the only acceptable state.

## File-size caps (NON-NEGOTIABLE)

A file that outgrows its cap is split by responsibility, not by line count. These are
soft caps: a file over the limit is a review question, not a build failure.

### Server (`services/`)

| Category | Soft cap | Rationale |
|---|---|---|
| Repository file | **300** | one aggregate. `student.repo.ts` at 1,275 lines in the legacy tree is the cautionary example this rule exists for |
| Service file | **400** | orchestration, error translation and port calls, so it gets modest headroom |
| Route module | **300** | one aggregate per module; handlers stay ≤15 lines each |
| Domain module | **200** | pure functions; split by concept (marks, grades, mapping) |
| Schema module | **250** | one table family. Drizzle definitions are declarative, so length is data, not logic. `people.ts` at 577 is over because one "person" family spans students, guardians, staff and their links |
| Middleware | **120** | one cross-cutting concern. A middleware that needs more is usually two |
| DTO / mapper | **150** | shape translation only. Anything else belongs in the service |

### Shared packages (`packages/`)

| Category | Soft cap | Rationale |
|---|---|---|
| Contract module | **400** | one domain's wire types plus their guards. `capabilities.ts` sits at 545 and is the pressure point |
| Pure-logic module | **250** | a reducer, scheduler or queue. Split by state machine, not by function count |
| React component (package) | **250** | one surface. A component that maps and renders is two |
| Package entry (`index.ts`) | **40** | re-exports only. Logic in a barrel file is invisible to the boundary tests |

### Web (`apps/web`)

| Category | Soft cap | Rationale |
|---|---|---|
| Route module | **40** | a page composes a surface; it does not implement one. Anything longer belongs in `components/` |
| Surface component | **300** | one surface, one file. Composer and editor living inside a list component is how `AgentsSurface` reached 586 before it was split |
| UI component | **150** | presentational, no data fetching. If it needs a fetch it is a surface |
| Client library (`lib/`) | **300** | one concern. `agent-runtime.ts` reached 458 before it was split into five |
| Hook | **120** | one behaviour. A hook that returns ten things is a state machine and belongs in `lib/` |
| Test file | **400** | beyond that it is testing two features and the name is lying |

### Rust (`crates/`, `apps/desktop`)

| Category | Soft cap | Rationale |
|---|---|---|
| Crate module (`lib.rs` / `mod.rs`) | **300** | module root wires; behaviour lives in siblings. `store/src/lib.rs` at 694 is the offender |
| Implementation module | **400** | one concern. `agui.rs` at 633 and `runtime.rs` at 611 both exceed it |
| Tauri command module | **250** | one command family. `agent.rs` at 474 holds seven commands and needs splitting by lifecycle |
| Type/protocol module | **350** | wire types plus serde attributes. Protocol files are long by nature |
| Rust test module | **400** | same rule as TypeScript tests |

### Vendored and generated (exempt)

| Category | Cap | Why exempt |
|---|---|---|
| `components/ui/*` | none | generated by `shadcn add`. A local split is undone by the next add and obscures the upstream diff |
| `packages/documents/src/DocumentEditor.tsx` | none | vendored Tiptap boilerplate; the split belongs upstream |
| `crates/ocr` model glue | none | generated from the pinned model release |

### Spec documents

No cap. Length is allowed, but inventories belong in the generated companions (`01b`,
`03b`) so a prose spec stays about decisions rather than lists.

**Current state, measured — not assumed.** Anything marked *over* is a split queued for a
later chunk, not a silent exception.

| Category | Largest file | Cap | Status |
|---|---|---|---|
| Repository | `academics/assignment.repo.ts` 294 | 300 | at the limit |
| Service | `agent/agents.ts` 405 | 400 | over by 5 — accepted, see below |
| Route (server) | `routes/agents.routes.ts` 245 | 300 | ok |
| Schema | `db/schema/people.ts` 577 | 250 | **over** — table family is one aggregate |
| Middleware | `http/middleware/tenant.ts` 74 | 120 | ok |
| DTO / mapper | `http/dto/settings.ts` 107 | 150 | ok |
| Domain | `services/domain/student-matcher.ts` 183 | 200 | at the limit |
| Contract | `contracts/capabilities.ts` 545 | 400 | **over** |
| Surface component | `workspace/AgentsSurface.tsx` 236 | 300 | ok — split into surface + two modals |
| Client library | `lib/agent-runtime.ts` 300 | 300 | at the limit — split into 5 modules |
| Hook | `hooks/use-proactive.ts` 113 | 120 | ok — store and loop extracted |
| Rust crate root | `crates/store/src/lib.rs` 694 | 300 | **over** |
| Rust module | `crates/agent/src/agui.rs` 633 | 400 | **over** |
| Tauri command | `desktop/src-tauri/src/agent.rs` 474 | 250 | **over** |
| Test file | `cowork-api/tests/gateway.test.ts` 364 | 400 | ok |

**Six files are over, and they are a queue, not a policy.** The rule above means nothing
if the list keeps growing, so the splits are ordered by how much they cost to leave:

1. ~~`AgentsSurface.tsx` 586~~ → **done**: 236 + `AgentComposerModal` 162 +
   `AgentEditorModal` 180.
2. ~~`use-proactive.ts` 229~~ → **done**: 113 + `use-agent-store` 57 +
   `lib/proactive-loop` 127.
3. ~~`agent-runtime.ts` 458~~ → **done**: 300 + `streaming-buffer` 62 +
   `turn-events` 128 + `runtime-connect` 111 + `turn-settlement` 74.
4. `crates/store/src/lib.rs` 694 → schema, journal and outbox are three modules.
5. `agui.rs` 633 / `runtime.rs` 611 → event mapping and turn lifecycle.
6. `desktop/src-tauri/src/agent.rs` 474 → seven commands split by lifecycle (connect,
   turn, approval).
7. `capabilities.ts` 545 → the tool catalogue is data; the resolver is logic.
8. `db/schema/people.ts` 577 → students, guardians and staff are three families.

**`agent/agents.ts` is 5 lines over and stays split-unsplit deliberately.** It is one
aggregate — read, list, create, re-grant, delete — and every function shares the same two
helpers (`ceilingOf`, `parseSnapshot`). Splitting it would move types into a second file
to buy nothing but a number. The cap is a review question, and the answer here is that the
next thing added to this file is the split trigger, not this one.

`components/ui/*` is exempt: those are generated by shadcn and vendored verbatim, so a
local split would be undone by the next `shadcn add` and would obscure the diff against
upstream.

## Cloudflare / Hono port

Start at [`docs/cloudflare-port/ROADMAP.md`](docs/cloudflare-port/ROADMAP.md). Phase
status lives in [`docs/cloudflare-port/PROGRESS.md`](docs/cloudflare-port/PROGRESS.md)
and must be updated in the same PR.

Port code lands in [`services/sms-api/`](services/sms-api/AGENTS.md) — read that file
first. Before a port PR, run `node scripts/verify-port-specs.mjs` and
`node scripts/verify-schema-catalog.mjs`, and paste the output in the description.

## Local Capability Layer (10C)

[`docs/workspace/specs/48-local-capability-layer.md`](docs/workspace/specs/48-local-capability-layer.md)
is normative. The layer is Rust domain crate → Tauri adapter/state → typed WebView
client → UI hook. Do not bypass it.

- Role tools are server-owned and capped at 5 tools / 8 operations. Host and server
  capabilities are separate booleans and never grant role authority.
- `packages/contracts/src/agent.ts`, `platform.ts`, `web.ts` and `json.ts` are the
  shared wire contracts. Every change needs a fixture plus a TS and a Rust test.
- EdApex tools are app-server dynamic tools (`web_search`, `web_fetch`,
  `ocr_extract`), executed in process. Do not add an EdApex MCP child process.
- The WebView never holds the EdApex bearer token or a provider key. Use the native
  `api_request` proxy and the OS keychain/Keystore only.
- RustO is the local OCR engine; Mistral is the explicit fallback. Student images
  never upload without `X-OCR-Consent: cloud`.
- **Desktop and mobile are native.** WebAssembly is the web delivery mechanism only.
  A host that can run native code uses `crates/*` directly; adding a WASM runtime to
  a native host needs a written justification and a recorded blocker. **Currently
  violated** — see [`docs/workspace/specs/50-native-agent-path.md`](docs/workspace/specs/50-native-agent-path.md):
  the Tauri commands exist and the web app never calls them.
- Do not add an `AGENT_DB` table to the school `DB`. Agent persistence lives in the
  separate `AGENT_DB` bound only to `services/cowork-api` (`41`/`42`).

## Workspace Web Architecture (`apps/web`)

Enforced by `apps/web/tests/workspace-architecture.test.ts`.

- **Persistent layout owns auth, session, runtime and shell.**
  `app/workspace/layout.tsx` wraps `WorkspaceLayoutClient`; Chat/Tasks/Make pages
  render only their surface. Never put `getSession`, `loadCapabilities`,
  `useWorkspaceRuntime` or the shell in a page.
- **Internal navigation uses `next/link`.** No `<a href>` inside the workspace shell;
  a full-page anchor remounts the layout and resets local state.
- **One boot per surface.** `WorkspaceBoot` selects Chat, Tasks, Make, Plugins, Search
  or Settings from `usePathname`.
- **The sidebar renders from a tree, not a list.** `lib/nav-tree.ts` holds one tree per
  context; the route selects it. Entering settings swaps the tree and adds "Back to app".
  Adding a destination means adding a tree entry, never a `<Link>` in the shell.
- **The tree animates; the rail width does not.** Animating width moves the content
  column, which on a 760px canvas reflows everything being read.
- **A settings row is a row.** Hairline-separated, label and description left, control
  right. Do not card individual settings — ten bordered cards is a stack of boxes.
  See [`docs/workspace/specs/51-settings-surface.md`](docs/workspace/specs/51-settings-surface.md).
- **Plugins is the UI word for connectors.** The server type stays `ConnectorKind`. The
  client catalogue in `lib/plugins-catalogue.ts` is a guarded copy — `tests/plugins-nav.test.ts`
  asserts it matches `packages/connectors/src/catalogue.ts`, because
  `packages/connectors` is server-only and must never reach a bundle.
- **Skeletons mirror the resolved page.** `.skeleton-shimmer` only; never mix pulse
  and shimmer.
- **Artifact editing is a split/sheet host**, not a nested editor: 38/62 above
  1024px, sheet below.
- **Dev-only CSP exceptions stay dev-only.** `unsafe-eval` must never reach the
  production CSP.

Design authority: [`DESIGN.md`](DESIGN.md) and
[`docs/workspace/specs/19-design-system.md`](docs/workspace/specs/19-design-system.md).
`DESIGN.md` is machine-checked — run
`pnpm dlx @google/design.md lint DESIGN.md --max-warnings 0` after editing it.

## Verification

```bash
pnpm --dir apps/web run check
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test
pnpm --dir services/sms-api run typecheck && pnpm --dir services/sms-api test
pnpm --dir services/cowork-api run typecheck && pnpm --dir services/cowork-api test
pnpm --dir packages/connectors run typecheck
cargo test -p edapex-agent -p edapex-ocr
cargo test -p edapex-store
cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm
node scripts/check-agent-size.mjs
```

Legacy production build — only when you have touched `legacy/`:

```bash
pnpm --dir legacy install --frozen-lockfile
pnpm --dir legacy run build
```
