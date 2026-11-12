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

```text
apps/
  api/                 Cloudflare Worker API (existing)
  web/                 React PWA: Next App Router via vinext, Rust core compiled to WASM
  desktop/             Tauri 2 shell for desktop and mobile WebView targets
    src-tauri/         Rust commands, state, auth, OCR/capture adapter
    src-tauri/plugins/camera/  first-party mobile camera plugin (iOS/Android)
packages/
  ui/                  Gold on Slate components (extract here only when a second React surface needs them)
  chat/                shared message primitives, queue/turn state, xcodex adapter, app-level OpenDuet composition
  genui/               OpenUI Lang catalog/parser/action bridge/React renderer
  documents/           PDF/DOCX/CSV/Markdown adapters, templates, renditions
  artifacts/           artifact model, inline cards, side panel, Tiptap editor
  contracts/           API/capability/type contracts shared by web/desktop
  workflows/           TypeScript workflow IR authoring and validation
  config/              lint/tsconfig/build presets
crates/
  core/                sessions, capabilities, approvals, local state
  agent/               xcodex host/protocol adapter and dynamic tools
  ocr/                 RustO local OCR, model validation and typed results
  needle/              Cactus Needle 3 C API wrapper
  sync/                iroh device identity and state/workspace sync
  workspace/           files and allowlisted shell
  sandbox/             QuickJS/wasmi/DSL execution
  documents/           IronPress PDF engine (crate + WASM)
docs/
  cloudflare-port/     backend port and cutover history
  workspace/           this programme
```

- Crate directories keep these short names; each Cargo package is named `edapex-<dir>` (`crates/core` → package `edapex-core`). Scaffolding order and Tauri wiring are owned by `30-tauri-rust-core.md`.

- The web and Tauri UI share React packages; they do not share DOM-specific code with native v2.
- `apps/web` is a Next App Router application built with **vinext** and deployed as a Cloudflare Worker with static assets at `app.llacademy.ng`. It is also the installable browser PWA. The previous static Pages deployment is a rollback artifact until cutover.
- `apps/web` owns `app/`, `components/`, `lib/`, `hooks/`, `worker/` and `cloudflare.config.ts`. It may use client-rendered authenticated surfaces, but must not embed school data or session tokens in rendered HTML or edge caches.
- `apps/api` remains the CF Worker (`api.llacademy.ng`) and keeps its own package/lockfile/deploy scripts.
- After Phase 9, `apps/api` joins the root pnpm workspace as a workspace package while remaining independently deployable; no standalone extraction.
- `packages/contracts` must not import server runtime code.
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
