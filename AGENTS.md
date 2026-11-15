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
- **One boot per surface.** `WorkspaceBoot` selects Chat, Tasks or Make from
  `usePathname`.
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
