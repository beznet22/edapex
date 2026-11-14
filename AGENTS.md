# Agent Instructions

## Package Manager & Scripts
Use **pnpm**: `pnpm install`, `pnpm run dev`, `pnpm run build`.
Use `pnx` or Aliases: `pnpm dlx`, `pnpx` to run any package or script that is not installed globally. 
Do not assume any package or script is installed globally.


## File-Scoped Commands
| Task | Command |
|------|---------|
| Typecheck | `pnpm run svelte-check --workspace path/to/file.svelte` |
| Lint | `pnpm run lint path/to/file.ts` |

## Key Conventions (EdApex Mastra Migration)
- **Architecture**: Modular monolith using Svelte 5 and Mastra AI Framework. Never create global singletons.
- **Isolation Boundaries**: Always bind queries and AI agents to the active `TenantContext` (`classId`, `schoolId`). Use Drizzle ORM.
- **Sovereign Storage**: Legacy MySQL `ai_` tables are deprecated. Mastra memory, configurations, and states run natively on `libSQL` (`mastra.db`).
- **Tool Organization**: Tools live in `src/lib/server/mastra/tools/operations/<group>/` where group is one of `context`, `read`, `write`, `destructive`, `reporting`, `parent`. Each group has an `index.ts` re-export. Shared utilities (e.g. `context-tool`, `choose-document`, `tinyfish-client`, `selection-tools`) live in `src/lib/server/mastra/tools/internal/`.
- **Marksheet Schema**: Use `marksheetSchema` and `Marksheet` from `src/lib/schema/marksheet.ts`. Persist validated marksheets via `AssessmentService.upsertMarksheet(marksheet: Marksheet, staffId: number): Promise<Marksheet>`.
- **ActionBar Architecture**: `src/lib/components/ai-elements/ActionBar.svelte` is the unified action-required surface rendered above `ChatComposer`. It handles tool approvals, option selection, ambiguity Q&A, and workflow resume — one component for every "user must decide" moment.
- **Skills**: Domain skills live in `src/lib/server/mastra/skills/<name>.skill.md` — `default`, `assistant`, `read`, `write`, `destructive`, `academic`, `reporting`, `parent` (one per operation group plus `default` and `assistant`).
- **UI/UX Guidelines**: Adhere to the design system defined in `src/routes/layout.css` for the **legacy SvelteKit tree only**. The active workspace app has its own token file: `apps/web/app/globals.css`. Do not treat `src/routes/layout.css` as the design authority for `apps/web`, and do not change either file's tokens without a spec amendment. Utilize "Gold on Slate" `oklch` tokens and shadcn-svelte components in `src/lib/components/ui/*`, `src/lib/components/ai-elements/*` and `src/lib/components/prompt-kit/*`. For `apps/web`, use shadcn/ui (`apps/web/components/ui/*`) per `docs/workspace/specs/19-design-system.md` and `15-ui-surfaces.md`.
- **Device Responsiveness Guidelines**: Adhere to the responsive design guidelines defined in `docs/responsive_design.md`.
- **Safety**: Apply `.omit()` on Zod schema mutations to prevent mass-assignment. Supervised LLM intents must reach a 90% confidence threshold to execute state mutations. See `docs/workspace/specs/60-security-privacy.md`.

# Code Quality Constraints (NON-NEGOTIABLE)
- **Absolute Production Readiness**: You must write complete, production-ready code. 
- **No Placeholders**: Never write logic like `// implementation goes here` or `// TODO: add validation`. You must execute the full implementation.
- **No Instructional Comments**: Do not riddle the codebase with comments explaining what the code is doing (e.g., `// This function fetches users`). Only comment on complex business logic tradeoffs (e.g., `// Debounced by 500ms to allow bulk Svelte reactivity batches to flush`).
- **Complete End-to-End**: If a task requires modifying an interface, writing a repository method, and exposing it via a Server Action, you must fully complete all three. Leaving tasks half-finished is a failure of your mission.

## TypeScript Type Safety (NON-NEGOTIABLE)

Every line of TypeScript must be **fully type-safe**. Loose types erode correctness silently and are forbidden.

### Banned Types
| Type | Why | Use Instead |
|------|-----|-------------|
| `any` | Disables all type checking | A concrete type, generic `<T>`, or `unknown` with a type guard |
| `never` (as annotation) | Masks unreachable logic bugs | Exhaustive `switch` returns; let TS infer `never` |
| `unknown` (raw) | Defers safety to runtime without a guard | `unknown` + an immediate type guard / assertion function |
| `object` | Too broad; allows any non-primitive | A specific interface or `Record<string, V>` |
| `Function` | Untyped callable | `(...args: A) => R` with explicit params and return |
| `{}` | Matches any non-nullish value | A named interface or `Record<string, unknown>` |

### Required Practices
- **Utility types over manual rewriting**: Use `Omit<T, K>`, `Pick<T, K>`, `Partial<T>`, `Required<T>`, and `Readonly<T>` to derive types from a single source of truth.
- **Infer from Zod schemas**: Derive runtime types with `z.infer<typeof schema>` instead of duplicating interfaces.
- **Explicit return types on exported functions**: Every exported function, server action, and API handler must declare its return type.
- **Const assertions for literals**: Use `as const` for fixed string unions, config objects, and enum-like values.
- **Strict generics**: Generic functions must constrain type params (`<T extends Base>`) — never use bare `<T>` when a bound exists.
- **No type assertions (`as`)**: Avoid `as Type` casts. Use type guards (`is`), assertion functions (`asserts x is T`), or `satisfies` instead. The only exception is `as const`.
- **Discriminated unions for variants**: Model mutually exclusive states with tagged unions (`{ kind: 'a'; ... } | { kind: 'b'; ... }`) — never optional fields that are "sometimes present."
- **Index signatures must be narrow**: Prefer `Record<SpecificKey, V>` over `Record<string, V>`. If a dynamic key is unavoidable, the value type must not be `any`.
- **Event handlers**: Type event callbacks with the framework's event type (e.g., `FormEventHandler<HTMLInputElement>`, SvelteKit `RequestEvent`) — never `(e: any) => void`.
- **Error handling**: Catch blocks must narrow `unknown` immediately: `if (err instanceof AppError)` or a type guard. Never cast `catch (e: any)`.
- **No `@ts-ignore` / `@ts-expect-error`**: Fix the underlying type issue. If a third-party type is genuinely wrong, wrap it in a thin typed adapter and document why.

### Verification
Run `pnpm run svelte-check --workspace path/to/file.svelte` and `pnpm run lint path/to/file.ts` after every change. Zero type errors is the only acceptable state.

## MCP Usage (Svelte 5 / SvelteKit)
- Run `list-sections` FIRST for new frontend topics.
- Run `get-documentation` based on `use_cases`.
- Run `svelte-autofixer` repeatedly until all Svelte specific issues resolve cleanly before submitting code.

## Cloudflare / Hono port

Any work on the Hono + Cloudflare + D1 port must start at [`docs/cloudflare-port/ROADMAP.md`](docs/cloudflare-port/ROADMAP.md). It contains the coding-agent working agreement and one brief per phase; the suite's own rules (62 legacy tables, D1 batching, tenant scoping, line caps) apply to port code even where this file is silent.

Port code lands in [`services/sms-api/`](services/sms-api/AGENTS.md) — read that file before adding anything there. Phase status is tracked in [`docs/cloudflare-port/PROGRESS.md`](docs/cloudflare-port/PROGRESS.md) and must be updated in the same PR.

Before opening a port PR, run `node scripts/verify-port-specs.mjs` and `node scripts/verify-schema-catalog.mjs`, and paste the output in the description.

## Local Capability Layer (10C)

Spec [`docs/workspace/specs/48-local-capability-layer.md`](docs/workspace/specs/48-local-capability-layer.md) is normative. The layer is Rust domain crate → Tauri adapter/state → typed WebView client → UI hook. Do not bypass it.

- Role tools remain server-owned and capped at 5 tools / 8 operations. Host and server capabilities are separate booleans and never grant role authority.
- `packages/contracts/src/agent.ts`, `platform.ts`, `web.ts` and `json.ts` are the shared wire contracts. Add a fixture and both a TS and Rust test for every change.
- Native xcodex uses `codex-app-server::in_process` on a Tokio thread, Tauri commands and `tauri::ipc::Channel<AgentEvent>`. No sidecar, no SSE production path, no server-side xcodex.
- EdApex tools are app-server dynamic tools (`web_search`, `web_fetch`, `ocr_extract`), executed in process. Do not add an EdApex MCP child process for them.
- The WebView never holds the EdApex bearer token or OpenRouter key. Use the native `api_request` proxy and OS keychain/Keystore only.
- RustO is the local OCR engine; Mistral is explicit fallback. Local OCR sends text/annotation only; student images never upload without `X-OCR-Consent: cloud`.
- Mobile camera is a first-party Tauri plugin: full-screen native preview, stills only, AVFoundation on iOS and CameraX on Android. Desktop uses file import and `xcap` screenshots.
- Browser assistance is desktop-only, user-installed official Chrome DevTools MCP. No custom extension, BrowserBridge, PWA or mobile browser control.
- Do not add an `AGENT_DB` table to the EdApex school `DB`. Agent persistence and sync live in a separate `AGENT_DB` database bound only to `services/cowork-api` (`41`/`42`).

Verification:

```bash
pnpm --dir apps/web check
pnpm --dir apps/web test
pnpm --dir services/sms-api run typecheck
pnpm --dir services/sms-api test
pnpm --dir services/cowork-api run typecheck
pnpm --dir services/cowork-api test
pnpm --dir packages/connectors run typecheck
cargo test -p edapex-agent -p edapex-ocr
cargo test -p edapex-store
cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm
node scripts/check-agent-size.mjs
```

`services/sms-api` is the current `services/sms-api` directory; the rename lands with the `05-project-structure.md` amendment and moves `scripts/verify-port-specs.mjs` in the same change.

## Workspace Web Architecture (`apps/web`)

The workspace follows these invariants. They are enforced by `apps/web/tests/workspace-architecture.test.ts`.

- **Persistent layout owns auth, session, runtime and shell.** `app/workspace/layout.tsx` wraps `WorkspaceLayoutClient`; Chat/Tasks/Make pages render only their surface component (`WorkspaceChat`, `TasksSurface`, `MakeSurface`). Never put `getSession`, `loadCapabilities`, `useWorkspaceRuntime` or the shell in a page.
- **Internal navigation uses `next/link`.** No `<a href>` for `/workspace`, `/workspace/tasks`, `/workspace/make` or `/admin` inside the workspace shell. Full-page anchors remount the layout and reset local state.
- **One boot per surface.** `WorkspaceBoot` selects Chat, Tasks or Make from `usePathname`; do not use one generic chat skeleton for every route.
- **Skeletons mirror the resolved page.** Use `.skeleton-shimmer` and the Boneyard configuration; never mix pulse and shimmer.
- **Artifact editing is a split/sheet host, not a nested editor.** Desktop uses the 38/62 split; below 1024px it uses the sheet. The editor stays on Gold on Slate tokens.
- **Dev-only CSP exceptions stay dev-only.** `unsafe-eval` and local HMR WebSocket origins must never appear in the production CSP.

Verification for this area:

```bash
pnpm --dir apps/web check
pnpm --dir apps/web test
pnpm --dir apps/web build
```
