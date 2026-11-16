# Agent Instructions — EdApex workspace

This repository holds **two systems** during the migration. Know which one you are
in before changing anything.

| Path | What | Status |
|---|---|---|
| `legacy/` | SvelteKit + Mastra monolith | **Serves production today.** Own instructions: [`legacy/AGENTS.md`](legacy/AGENTS.md) |
| `apps/web` | Workspace web app (vinext + React) | The replacement surface |
| `apps/desktop` | Tauri shell. The desktop window **and** the Android app — `mobile/` will be its frontend, `src-tauri/plugins/` holds `runhost` and `camera` | New |
| `services/` | `sms-api`, `cowork-api`, `model-router` | New, Cloudflare Workers |
| `packages/` | `contracts`, `chat`, `genui`, `documents`, `connectors`, **`tokens`, `ui`, `host`** | New, shared TypeScript |
| `crates/` | `agent`, `agent-wasm`, `store`, `ocr`, `core`, `ocr-bench` | New, Rust |
| `docs/` | `cloudflare-port`, `workspace`, `desktop`, research | New |
| `scripts/` | New-system tooling only. Brand asset generation lives in `scripts/brand/` | New |

New code goes in `apps/`, `services/`, `packages/` or `crates/`. Never add to
`legacy/` except to keep production working. A change that has to touch both trees is
a migration step, not a refactor — say so in the PR.

## Package Manager & Scripts

Use **pnpm** from the repository root: `pnpm install`, `pnpm --dir apps/web dev`.
Run anything not installed globally with `pnpm dlx` (or `pnpx`). Do not assume a
global binary exists.

`legacy/` is a **standalone pnpm project** with its own `pnpm-workspace.yaml` and
lockfile, and no `@edapex/*` dependency. A root install must not reach into it.

`apps/web` declares `engines: node >=26.13.1 <27`. If `vite build` fails with
"cloudflare.config.ts loading requires Node.js v22.18.0 or higher", you are on the
wrong Node — put the right one first on `PATH` rather than downgrading the build.

# Global rules (NON-NEGOTIABLE)

These apply to every app, package, service and crate. A rule that exists only in prose
is a preference; these have a script or a test behind them, named where one exists.

## Design values

- **One source.** `packages/tokens/tokens.css` is the only file that defines a colour,
  type size, radius, shadow or motion duration. A second definition is a bug, not a
  variant.
- **No arbitrary Tailwind values** in any app or package: no `w-[344px]`, `bg-[#fff]`,
  `shadow-[var(--x)]`, no raw palette (`bg-slate-100`, `text-white`). Use a named
  utility generated from a token. Enforced by `node scripts/check-tokens.mjs`, which
  ratchets against `scripts/token-baseline.json`.
- **No inline `style`** except a runtime-computed value written as a CSS custom
  property (`--inset-top`, `--keyboard-inset`).
- **Variants via CVA**, never a template-literal class string — a class name must be
  traceable to one definition.
- **`rem` type from `--text-*`, never a `px` font size. `dvh`, never `vh`.**
- **Three type sizes, two weights** (`text-title`, `text-body`, `text-label`). A fourth
  is a design decision, not a local one.
- **Depth over borders**: elevation 1–3; hairline at 6% light / 10% dark.
- **A host difference is a token resolved at the edge**, never a forked component
  (`DESIGN.md:214-227`).
- **Touch targets ≥ 44dp; primary actions ≥ 48dp.** Focus ring always visible,
  including on a Chromebook.
- **Animate `transform` and `opacity` only.** Never `width`, `height`, `top`, `left` or
  `margin`, and no `transition-all` — name the properties.
- **Motion comes from `packages/tokens`.** Spatial moves use a standard spring,
  colour/opacity uses an effects spring, and exactly one expressive spring is reserved
  for Send and the camera shutter. A component never hand-tunes a duration or a curve.
- **Motion honours `prefers-reduced-motion`**: spatial snaps, effects keep the fast
  curve, and infinite animations pause when the app is not visible.
- **`prefers-reduced-transparency: reduce` makes `.glass` opaque**, and no backdrop
  blur goes on a scrolling container.
- **Skeletons are `.skeleton-shimmer`** with a 150ms delay. Never mix pulse and
  shimmer.
- **Safe-area padding is written once**, in the app shell's `Screen` component. A leaf
  component never writes `env()`.

## UI components

- **shadcn is the primitive layer.** Never hand-write a component the registry
  provides — no custom `modal`, no custom `tabs`, no custom dropdown.
- **Install with the CLI, in the app directory**: `pnpm dlx shadcn@latest add <name>`.
  It routes the file to `packages/ui` and rewrites the app's imports. Every workspace
  that installs or receives a component has a `components.json`, and all of them agree
  on `style`, `baseColor` and `iconLibrary`.
- **`tailwind.css` in every `components.json` points at `packages/tokens/tokens.css`.**
  The CLI writes CSS variables into whichever file this names, and the token sheet is
  the only file allowed to receive a design value.
- **Modify by token, not by fork.** After `add`, a component may change palette/scale
  classes for token utilities, gain or adjust CVA variants, gain mobile hit-area and
  safe-area padding. It may **not** change its exported API, `data-slot` attributes,
  Radix composition (`asChild`) or accessibility wiring.
- **A component the registry cannot express is composed, not rewritten** — built from
  registry primitives and listed in `packages/ui/README.md` with a reason.
- **No second primitive library.** No Radix directly in a shell component, no headless
  UI, no custom dialog.
- Base chat primitives (`Bubble`, `Message`, `Message Scroller`, `Attachment`) are
  allowed; **shadcn AI Elements and assistant-ui are not**.

## Imports and boundaries

- **One-way**: `apps/* → packages/*`. A package never imports an app; an app never
  imports another app. Enforced by `node scripts/check-boundaries.mjs`.
- **Promote, don't copy.** A primitive needed by two React surfaces moves to
  `packages/ui`.
- `packages/host/agent` is host-agnostic; host APIs live only in the host subpath.
- **The WebView never holds a bearer token or a provider key.** Native proxy and OS
  keychain only.
- **A client copy of server data needs an equality test** against the server source —
  the plugins catalogue is the precedent.

## Contracts and errors

- Wire shapes live in `packages/contracts` and change with a **fixture + a TS test + a
  Rust test**.
- **Every failure is a typed error and the copy names it.** Never "something went
  wrong".
- Rust maps its error enum to `HostError { code, message, retryable }` at the boundary;
  no stringly-typed throws.

## Runtime

- **One agent runtime: `crates/agent`.** WebAssembly is the web delivery mechanism, not
  a second runtime.
- **Durable records go through `crates/store`.** No ad-hoc JSON files for records.

## Performance

- **A list that can grow is windowed.** Past ~50 rows, window it.
  `content-visibility: auto` only with `contain-intrinsic-size`. `IntersectionObserver`
  drives work; a scroll listener is never the answer.
- **Load on viewport, not on mount.** Pagination, PDF pages and images start when they
  enter the viewport, behind an in-flight guard, and drop their result if the surface
  unmounted.
- **Long work leaves the UI thread.** Every Rust command that can exceed a frame is
  `async` + `spawn_blocking`. A synchronous command that does real work blocks IPC and
  becomes an ANR.
- **Batch at the boundary.** Never one IPC message per token; never one SQLite
  transaction per event. 16 ms windows for both.
- **Prefetch on intent, never on load** — `pointerenter`, `requestIdleCallback`.
- **Measure before claiming.** LCP, INP, long tasks, AAB size, IPC count per turn; the
  budgets live in `docs/workspace/specs/81-mobile-shell.md` and a regression is a failed
  gate.

## Dependencies

- **No new runtime dependency without a written reason** in the PR: what it replaces,
  its licence, its size, and what happens when it stops being maintained.
- **Workspace packages first.** If `packages/*` already does it, import it; do not add a
  third-party equivalent.
- **Pin exact versions in the fidelity path** — `streamdown`, `pdfjs-dist`,
  `ironpress`, `rusto-rs`. A minor bump there changes rendering or inference, not
  behaviour at the margin.
- **One library per concern**: Radix is the primitive layer, CVA the variant layer, `cn`
  the merge layer. A second of any of these is a no.
- **No `tailwind.config.js`** — v4 is CSS-first. **No `tailwindcss-animate`** (use
  `tw-animate-css`). **One icon set** (`lucide-react`).
- **Server-only packages never reach a client bundle.** A client copy needs an equality
  test.
- **Rust: `default-features = false`** with a documented feature set. **Mobile is
  rustls-only** — no `native-tls` in a path that compiles for Android
  ([`docs/desktop/patches/`](docs/desktop/patches/)).

## Naming and layout

- One package per workspace entry, named `@edapex/<dir>`; the directory name is the
  package name.
- **A package entry is re-exports only** (≤40 lines). Logic in a barrel is invisible to
  the boundary tests.
- **Subpath exports beat a single barrel** when a module pulls a host API:
  `@edapex/host/agent/native` exists so the web bundle never resolves
  `@tauri-apps/api`.
- **The filename names the concept, one concept per file.** Banned stems: `helpers`,
  `misc`, `common`, `utils` (except the shadcn `cn` module), `manager`, `types`.
- React: `PascalCase.tsx` exports the component of that name; `use-*.ts` for hooks;
  `*Provider.tsx` for context. Rust: snake_case modules, `lib.rs`/`mod.rs` wire only.
  Kotlin: `*Plugin`, `*Activity`, `*Worker` suffixes.
- Tests colocated for unit (`*.test.ts` beside the source), `tests/` for integration,
  `e2e/` for Playwright.
- Specs are `NN-kebab-name.md` with a `Status:` line; numbers are allocated, never
  reused, never renumbered.

## Testing

- **Must have a test**: every reducer and state machine, the streaming buffer, turn
  settlement, every contract change (fixture + TS guard + Rust parity), any Rust type
  crossing IPC, the token ratchet, the boundary and doc checks, and the behaviours that
  only fail on a device — sheet dismissal by `Esc` and by back, 44dp hit areas,
  package-name identity.
- **May go untested**: presentational primitives, generated CSS, config files.
- **A test that cannot fail is not a test.** Assert a value, not that a call happened.
- **No `any` in tests either.** A regression test names the bug it prevents.
- **Do not mock what you own.** Mock the network and the clock.

## Commits and PRs

- **One concern per commit.** A refactor and a behaviour change never share one — that
  is why the package extraction is `tokens` / `ui` / `host` / `docs` and not one
  commit.
- **A move is verifiable as a move**: `git diff -M` shows renames, and the gates pass
  with no edits beyond imports.
- **PR description**: what changed, why, the gates run with output pasted for
  `verify-port-specs.mjs` / `verify-schema-catalog.mjs`, and any file that crossed its
  cap with its split plan.
- **A change to the architecture, the package layout or the host model updates
  `AGENTS.md` in the same PR.** `check-docs.mjs` is the enforcement; the PR text is the
  record.
- **`PROGRESS.md` ships in the same PR** as the phase it describes.
- **A spec is amended, not silently contradicted.** If the code must deviate, the PR
  either changes the spec or records the blocker inside it.
- **A migration step that touches both `legacy/` and the new tree says so**, per the top
  of this file.

## Process

- **Every spec declares `Status:`** — Draft, Normative or Superseded.
- **`AGENTS.md`'s map lists every package**, enforced by `scripts/check-docs.mjs`.
- **A file over its cap is a review question; the over-list is a queue with an owner**,
  not an exception list.
- Typecheck before claiming done. Zero errors.
- No placeholder, no TODO, no comment explaining what the code already says.

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

### Shared packages (`packages/`)

| Category | Soft cap | Rationale |
|---|---|---|
| Token sheet (`tokens/tokens.css`) | **900** | values only: `:root`, `.dark`, `[data-accent]`, system mirror, `@theme`, base layer. A selector that depends on a route or a window belongs in an app |
| JS in `packages/tokens` | **0 files** | the package is CSS; a `.ts` there is a design-system bug |
| Primitive component (`ui/`) | **150** | presentational, no data fetching. If it needs a fetch it is a surface |
| Host module (`host/`) | **300** | one transport concern. `adapter.ts` is the ceiling |
| Host type module | **200** | the seam's shapes, nothing executable |
| Contract module | **400** | one domain's wire types plus their guards. `capabilities.ts` at 545 is the pressure point |
| Pure-logic module | **250** | a reducer, scheduler or queue. Split by state machine, not by function count |
| React component (package) | **250** | one surface. A component that maps and renders is two |
| Package entry (`index.ts`) | **40** | re-exports only |
| Package README | **120** | what it is, what it may not do |

### Server (`services/`)

| Category | Soft cap | Rationale |
|---|---|---|
| Repository file | **300** | one aggregate. `student.repo.ts` at 1,275 lines in the legacy tree is the cautionary example |
| Service file | **400** | orchestration, error translation and port calls |
| Route module | **300** | one aggregate per module; handlers stay ≤15 lines each |
| Domain module | **200** | pure functions; split by concept (marks, grades, mapping) |
| Schema module | **250** | one table family. `people.ts` at 577 spans students, guardians, staff and their links |
| Middleware | **120** | one cross-cutting concern |
| DTO / mapper | **150** | shape translation only |
| Worker entry (`worker.ts`, `src/app.ts`) | **120** | wiring only |
| D1 adapter / query module | **300** | one aggregate |
| Migration (`.sql`) | **no cap** | declarative and append-only |
| Fixture / seed | **200** | data, one scenario |
| Script (`*.mjs`) | **150** | one check, one job |
| Test file | **400** | beyond that it is testing two features |

### Web (`apps/web`)

| Category | Soft cap | Rationale |
|---|---|---|
| Route module | **40** | a page composes a surface; it does not implement one |
| Surface component | **300** | one surface, one file |
| UI component | **150** | presentational, no data fetching |
| Shell / provider component | **250** | chrome and wiring |
| Client library (`lib/`) | **300** | one concern |
| Hook | **120** | one behaviour |
| Stylesheet, non-token | **400** | after the token move `globals.css` is ~150; a stylesheet past 400 wants splitting by concern |
| E2E spec | **400** | one feature per spec |
| Config (`playwright.config.ts`, `vite.config.ts`) | **120** | wiring |
| Service worker | **150** | cache policy only |

### Mobile (`apps/desktop/mobile`) — planned

| Category | Soft cap | Rationale |
|---|---|---|
| Screen module | **200** | composes; does not implement |
| Surface component | **300** | |
| Shell component | **250** | |
| Client library | **300** | |
| Hook | **120** | |
| Token extension sheet | **250** | additive `@theme` only |
| Locale catalogue | **400** | strings, one namespace |
| E2E spec | **400** | |

### Tauri (`apps/desktop/src-tauri`)

| Category | Soft cap | Rationale |
|---|---|---|
| Command module | **250** | one command family. `agent.rs` at 474 holds seven and is queued for a split |
| Plugin Rust module | **250** | one plugin concern |
| Plugin Kotlin module | **250** | one native concern |
| Kotlin Activity | **200** | lifecycle and insets only; no business logic |
| `lib.rs` (builder + registration) | **120** | the registration list only |
| Shared state module | **150** | the handles, nothing else |
| Gradle script (`.kts`) | **120** | |

### Rust (`crates/`)

| Category | Soft cap | Rationale |
|---|---|---|
| Crate module (`lib.rs` / `mod.rs`) | **300** | module root wires; behaviour lives in siblings |
| Implementation module | **400** | one concern |
| Type / protocol module | **350** | wire types plus serde attributes |
| Event / state-machine module | **300** | |
| Port / trait module | **200** | |
| Error module | **120** | one enum and its mapping |
| Build script | **60** | |
| Bench | **250** | |
| Rust test module | **400** | same rule as TypeScript tests |

### Scripts and docs

| Category | Soft cap | Rationale |
|---|---|---|
| Verification script (`scripts/*.mjs`) | **200** | one invariant |
| Spec | **no cap** | decisions, not inventories |
| `AGENTS.md` | **no cap** | the map and the ruleset. A cap would force deleting a rule to add a rule |
| Config (`tsconfig`, `wrangler.jsonc`, capability JSON, manifest) | **no cap** | declarative |

### Vendored and generated (exempt from splitting, not from review)

| Path | Why exempt |
|---|---|
| `packages/ui/src/components/*` | shadcn-vendored. A local split is undone by the next `shadcn add` and obscures the upstream diff |
| `packages/documents/src/DocumentEditor.tsx` | vendored Tiptap boilerplate; the split belongs upstream |
| `crates/ocr` model glue | generated from the pinned model release |
| `apps/desktop/src-tauri/gen/android/**` | `tauri android init` output. Configure it, never restructure it |
| `apps/web/public/agent-runtime/**` | build output |
| lockfiles | — |

### Spec documents

No cap. Length is allowed, but inventories belong in the generated companions (`01b`,
`03b`) so a prose spec stays about decisions rather than lists.

**Current state, measured — not assumed.** Anything marked *over* is a split queued for
a later chunk, not a silent exception.

| Category | Largest file | Cap | Status |
|---|---|---|---|
| Token sheet | `packages/tokens/tokens.css` 918 | 900 | at the limit — the next value group starts a second sheet |
| Host module | `packages/host/src/agent/adapter.ts` 317 | 300 | over by 17 — the settle/queue methods belong in a sibling |
| Primitive component | `packages/ui/src/components/message-scroller.tsx` 128 | 150 | ok |
| Repository | `academics/assignment.repo.ts` 294 | 300 | at the limit |
| Service | `agent/agents.ts` 405 | 400 | over by 5 — accepted, see below |
| Route (server) | `routes/agents.routes.ts` 245 | 300 | ok |
| Schema | `db/schema/people.ts` 577 | 250 | **over** — one table family |
| Middleware | `http/middleware/tenant.ts` 74 | 120 | ok |
| DTO / mapper | `http/dto/settings.ts` 107 | 150 | ok |
| Domain | `services/domain/student-matcher.ts` 183 | 200 | at the limit |
| Contract | `contracts/capabilities.ts` 545 | 400 | **over** |
| Surface component | `workspace/WorkspaceShell.tsx` 368 | 300 | **over** — split shell chrome from nav |
| Shell / provider | `WorkspaceLayoutClient.tsx` 290 | 250 | **over** |
| Client library | `apps/web/lib/pdf.ts` 172 | 300 | ok — `agent-runtime.ts` left in A3 |
| Hook | `hooks/use-proactive.ts` 113 | 120 | ok |
| Stylesheet | `apps/web/app/globals.css` 150 | 400 | ok — 849 lines moved to tokens |
| E2E spec | `e2e/workspace.spec.ts` 327 | 400 | ok |
| Rust crate root | `crates/store/src/lib.rs` 694 | 300 | **over** |
| Rust module | `crates/agent/src/agui.rs` 633 | 400 | **over** |
| Tauri command | `desktop/src-tauri/src/agent.rs` 474 | 250 | **over** |
| Test file | `cowork-api/tests/gateway.test.ts` 364 | 400 | ok |

**Nine files are over, and they are a queue, not a policy.** Ordered by how much they
cost to leave:

1. ~~`AgentsSurface.tsx` 586~~ → **done**: 236 + `AgentComposerModal` 162 +
   `AgentEditorModal` 180.
2. ~~`use-proactive.ts` 229~~ → **done**: 113 + `use-agent-store` 57 +
   `lib/proactive-loop` 127.
3. ~~`agent-runtime.ts` 458~~ → **done**: split into five, then moved to
   `packages/host`, where it is 317 and needs one more split.
4. ~~`apps/web/app/globals.css` 999~~ → **done**: 849 lines to `packages/tokens`,
   leaving 150.
5. `crates/store/src/lib.rs` 694 → schema, journal and outbox are three modules.
6. `agui.rs` 633 / `runtime.rs` 611 → event mapping and turn lifecycle.
7. `desktop/src-tauri/src/agent.rs` 474 → seven commands split by lifecycle.
8. `capabilities.ts` 545 → the tool catalogue is data; the resolver is logic.
9. `db/schema/people.ts` 577 → students, guardians and staff are three families.
10. `WorkspaceShell.tsx` 368 / `WorkspaceLayoutClient.tsx` 290 → chrome from wiring.
11. `packages/host/src/agent/adapter.ts` 317 → settle and queue in a sibling.

**`agent/agents.ts` is 5 lines over and stays split-unsplit deliberately.** It is one
aggregate — read, list, create, re-grant, delete — and every function shares the same two
helpers (`ceilingOf`, `parseSnapshot`). Splitting it would move types into a second file
to buy nothing but a number.

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
  Adding a WASM runtime to a native host needs a written justification and a recorded
  blocker. The `NEXT_PUBLIC_NATIVE_AGENT=1` flag in `build:desktop` / `build:mobile` is
  what makes a Tauri build select the native transport; see
  [`docs/workspace/specs/50-native-agent-path.md`](docs/workspace/specs/50-native-agent-path.md)
  for the device verification that still has to happen.
- Do not add an `AGENT_DB` table to the school `DB`. Agent persistence lives in the
  separate `AGENT_DB` bound only to `services/cowork-api` (`41`/`42`).

## Hosts and the agent runtime

[`docs/system.md`](docs/system.md) is the authority. Three hosts: web PWA, Tauri
desktop, Tauri Android.

- **One agent runtime: `crates/agent`.** Not two. Web delivery is `crates/agent-wasm` →
  `apps/web/public/agent-runtime/`; native delivery is the in-process `AgentHost` in
  `apps/desktop/src-tauri`.
- The transport is **host-injected**: web `fetch(credentials: "include")`, native
  `reqwest` + keychain token. `AgentTransport` (`packages/host/src/agent/transport.ts`)
  — `kind`, `connect`, `startTurn` — is the only seam a surface sees.
- `packages/host/agent` must not import `next/*` or `@tauri-apps/*`.
  `packages/host/agent/native` is the only module that touches `@tauri-apps/api`.
- Android ships **no** WASM. `apps/desktop/mobile` fails its build if
  `edapex_agent_wasm*` appears in `dist/`.
- A turn's durability is a native-host concern — foreground service, WorkManager,
  journal. Read [`docs/workspace/specs/81-mobile-shell.md`](docs/workspace/specs/81-mobile-shell.md)
  before touching any of it.
- The proof that the native path is real is not a typecheck: **delete
  `public/agent-runtime/`, build the desktop shell, run a turn.**

## Mobile (Android)

[`docs/workspace/specs/81-mobile-shell.md`](docs/workspace/specs/81-mobile-shell.md) is
normative. The facts a future agent would otherwise rediscover the hard way:

- Entry points: `apps/desktop/mobile` (frontend), `src-tauri/tauri.android.conf.json`
  (platform override), `src-tauri/plugins/{runhost,camera}`.
- Never put a mobile value in `tauri.conf.json`; never edit the desktop config for
  mobile. Arrays replace on merge.
- **No app bar anywhere.** Edge-to-edge with `--inset-*`; safe-area padding is written
  once, in `Screen`.
- Breakpoints are M3 window classes as tokens (600 / 840 / 1200 / 1600 dp) plus
  `short` / `tall`. API 37 forbids locking orientation — a layout that assumes portrait
  is a bug.
- **No arbitrary Tailwind values.** `pnpm --dir apps/desktop/mobile run check` runs
  `check-tokens.mjs` alongside `tsc`.
- Design values come from `@edapex/tokens`. A mobile-only value is an **additive**
  `@theme` token, never an override of a shared one.
- Package name `com.bronotek.edapex` must equal the Play Console entry,
  `applicationId`, and the `MainActivity` package — `check-docs.mjs` asserts all three.
- `agent_connect` **reuses** a live session. Closing it kills a background run on the
  next open.
- A real device is the only place this is verified. USB and wireless instructions live
  in the mobile spec; `adb reverse tcp:5182 tcp:5182` is the step that is forgotten
  most.

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
  context; the route selects it. Adding a destination means adding a tree entry, never
  a `<Link>` in the shell.
- **The tree animates; the rail width does not.** Animating width moves the content
  column, which on a 760px canvas reflows everything being read.
- **A settings row is a row.** Hairline-separated, label and description left, control
  right. Do not card individual settings.
  See [`docs/workspace/specs/51-settings-surface.md`](docs/workspace/specs/51-settings-surface.md).
- **Plugins is the UI word for connectors.** The server type stays `ConnectorKind`. The
  client catalogue in `lib/plugins-catalogue.ts` is a guarded copy —
  `tests/plugins-nav.test.ts` asserts it matches
  `packages/connectors/src/catalogue.ts`, because `packages/connectors` is server-only
  and must never reach a bundle.
- **Skeletons mirror the resolved page.** `.skeleton-shimmer` only.
- **Artifact editing is a split/sheet host**, not a nested editor: 38/62 above
  1024px, sheet below.
- **Dev-only CSP exceptions stay dev-only.** `unsafe-eval` must never reach the
  production CSP.
- **Primitives come from `@edapex/ui`.** `components/ui` holds shell chrome only:
  `sidebar`, `command`, `breadcrumb`, and a `Modal` that *composes* the registry `Dialog`
  rather than reimplementing focus trapping.

Design authority: [`DESIGN.md`](DESIGN.md) and
[`docs/workspace/specs/19-design-system.md`](docs/workspace/specs/19-design-system.md).
`DESIGN.md` is machine-checked — run
`pnpm dlx @google/design.md lint DESIGN.md --max-warnings 0` after editing it.

## Verification

```bash
# architecture, docs and tokens — the drift guards
node scripts/check-boundaries.mjs
node scripts/check-docs.mjs
node scripts/check-tokens.mjs

# brand assets — generates into brand/dist/ only, then proves what it wrote
pnpm brand:build
pnpm brand:validate
pnpm --dir apps/web run check
pnpm --dir apps/web test
pnpm --dir apps/web exec playwright test
pnpm --dir apps/web run check:budget
pnpm --dir packages/tokens test
pnpm --dir packages/ui run typecheck
pnpm --dir packages/host run typecheck
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
