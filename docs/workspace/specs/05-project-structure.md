# 05 — Workspace Project Structure

**Status:** Phase 9B planning approved; 10B preview deployed; 10C capability implementation in progress. This spec owns repository and deployment boundaries only.

## Specification context

This spec answers **where code lives and how it is deployed**. It does not define what a screen looks like, how chat state behaves, or how generated UI is validated.

- `15-ui-surfaces.md` owns routes, shell/navigation and platform presentation.
- `17-chat-framework.md` owns chat state, message parts and the xcodex adapter.
- `19-design-system.md` owns Gold tokens, primitives and accessibility.
- `21-generative-ui-openui.md` owns OpenUI catalog, validation and actions.
- `43`/`44` own source reuse and audit rules.
- `47` owns measured budgets and release gates.

If a deployment choice conflicts with a workspace behavior spec, stop and resolve the conflict explicitly. Do not let a file-layout change silently redefine product behavior.

## Target repository layout

`apps/` holds user-facing surfaces. `services/` holds deployable backends. `packages/` holds libraries that never deploy.

```text
apps/
  web/                 React PWA: Next App Router via vinext, Rust core compiled to WASM
  desktop/             Tauri 2 shell for desktop and mobile WebView targets
    src-tauri/         Rust commands, state, auth, OCR/capture adapter
    src-tauri/plugins/camera/  first-party mobile camera plugin (iOS/Android)
services/
  sms-api/             EdApex school API (Cloudflare Worker; owns DB + MEDIA)
  cowork-api/          Cowork API (Cloudflare Worker; owns AGENT_DB + SYNC_MEDIA)
  model-router/        Model routing and policy (Cloudflare Worker; no public hostname)
packages/
  ui/                  Gold on Slate components (extract here only when a second React surface needs them)
  chat/                shared message primitives, queue/turn state, thin-core adapter, app-level OpenDuet composition
  genui/               OpenUI Lang catalog/parser/action bridge/React renderer
  documents/           PDF/DOCX/CSV/Markdown adapters, templates, renditions
  artifacts/           artifact model, inline cards, side panel, Tiptap editor
  contracts/           API/capability/type contracts shared by web/desktop/services
  connectors/          server-side MCP client, Google client, connector catalogue
  capabilities/        first-party capability pack definitions and validation
  workflows/           TypeScript workflow IR authoring and validation
  config/              lint/tsconfig/build presets
crates/
  core/                sessions, capabilities, approvals, local state
  agent/               thin provider-neutral runtime and dynamic tools
  agent-wasm/          cdylib + wasm-bindgen wrapper for the browser surface
  store/               local SQLite, per-record encryption, sync outbox
  ocr/                 RustO local OCR, model validation and typed results
  needle/              Cactus Needle 3 C API wrapper
  workspace/           files and allowlisted shell
  sandbox/             QuickJS/wasmi/DSL execution
  documents/           IronPress PDF engine (crate + WASM)
docs/
  cloudflare-port/     backend port and cutover history
  workspace/           this programme
```

- Crate directories keep these short names; each Cargo package is named `edapex-<dir>` (`crates/core` → package `edapex-core`). Scaffolding order and Tauri wiring are owned by `30-tauri-rust-core.md`.
- There is no `crates/sync`. Device sync is server-mediated through `AGENT_DB`; iroh is deferred (`41-storage-sync.md`).

- The web and Tauri UI share React packages; they do not share DOM-specific code with native v2.
- `apps/web` is a Next App Router application built with **vinext** and deployed as a Cloudflare Worker with static assets at `app.llacademy.ng`. It is also the installable browser PWA. The previous static Pages deployment is a rollback artifact until cutover.
- `apps/web` owns `app/`, `components/`, `lib/`, `hooks/`, `worker/` and `cloudflare.config.ts`. It may use client-rendered authenticated surfaces, but must not embed school data or session tokens in rendered HTML or edge caches.
- `services/sms-api` is the CF Worker (`api.llacademy.ng`) and keeps its own package/lockfile/deploy scripts. It owns the `DB` and `MEDIA` bindings.
- `services/cowork-api` is a separate CF Worker owning `AGENT_DB` and `SYNC_MEDIA`. It does **not** bind the school `DB`; it verifies identity through a Cloudflare service binding to `services/sms-api`.
- `services/model-router` is a third CF Worker with **no public hostname** (`workers_dev: false`, no `routes`). It is reached only by `services/cowork-api` over a service binding, and it is the only process holding a provider credential or reaching Cloudflare AI Gateway.
  - Provider keys are not stored in the Worker. They live in AI Gateway via BYOK and are selected per tenant with `cf-aig-byok-alias`.
  - Every request sets `cf-aig-collect-log: false`. AI Gateway logs prompt and response bodies by default, and prompts here contain school records; a browser reaching the gateway directly could omit the header, which is why it never does.
  - Requests use direct provider passthrough, never the Unified Billing surface, where a missing BYOK key silently falls through to Cloudflare billing.
  - The public surface is OpenAI-compatible (`GET /v1/models`, `POST /v1/chat/completions`) because `crates/agent` already produces and parses that format. Compatibility describes the wire format, not reachability.
- **Browser model traffic terminates on `services/sms-api`**, not on `cowork-api` or `model-router`. `POST /api/v1/agent/model/chat/completions` resolves the session, stamps the caller identity and forwards over a service binding.
  - Reason: the session cookie is `__Host-edapex_session`, bound to the exact host and carrying no `Domain`, so no other hostname can receive it.
  - The route is mounted **outside** the tenant middleware. Hono matches `use("/agent/*")` against the whole prefix, so the tenant rules are now scoped per route (`/agent/capabilities`, `/agent/platform-capabilities`, `/agent/web/*`) rather than by wildcard. A workspace with no school must still be able to run an agent.
  - The passthrough carries no credential and no agent logic; it exists so there is exactly one session-validation implementation.
- Each service keeps its own `wrangler.jsonc`, migration directory and CI job. No cross-service runtime import; no `db/schema` import crossing a service boundary.
- `packages/contracts` must not import server runtime code.
- `packages/connectors` and `packages/capabilities` are libraries consumed by `services/cowork-api`; they are not deployables.
- `crates` are platform libraries; Tauri calls them directly, web uses their WASM build.
- No Svelte imports from the new workspace packages.

## Legacy SvelteKit codebase

The current root SvelteKit app is a separate legacy deployment. It is not moved or deleted during Phase 9B.

Retirement sequence after the Phase 8/9A gate:

1. Freeze feature work; mark maintenance-only.
2. Tag the final commit/branch, e.g. `legacy-sveltekit-final`.
3. Keep the code and deployment available through the rollback window.
4. Exclude the legacy app from the new workspace build/CI without deleting history.
5. Archive its docs, environment instructions and data-retention record.
6. Retire domains/redirects only after the new surface is verified.
7. Delete the legacy tree only with explicit approval after retention/legal review.

Do not move `src/` into a `legacy/` directory before the rollback window; that would break current references and make rollback harder. Archive by tag/branch first.

## Workspace build rules

- pnpm workspace for JS/TS packages.
- Cargo workspace for Rust crates.
- Tauri config owns desktop/mobile packaging.
- `apps/web` builds with vinext; `vite build` produces the Worker + static assets. Local development uses the vinext Vite server; the Cloudflare plugin is enabled for production builds and deploy previews.
- `apps/web/cloudflare.config.ts` owns the Worker name, entrypoint, compatibility date and static-asset routing. The Worker entry is `apps/web/worker/index.ts`.
- No new feature work in `src/` legacy.
- `docs/cloudflare-port` remains the cutover archive; `docs/workspace` is the active programme.
- CI must not build the legacy SvelteKit app after retirement unless explicitly running the archive job.
