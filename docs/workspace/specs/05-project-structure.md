# 05 — Workspace Project Structure

**Draft.** Phase 9B planning only; no moves or build changes are made now.

## Target repository layout

```text
apps/
  api/                 Cloudflare Worker API (existing)
  web/                 React PWA; Rust core compiled to WASM
  desktop/             Tauri 2 shell for desktop and mobile WebView targets
packages/
  ui/                  Gold on Slate components, shell primitives
  chat/                OpenDuet-derived transcript/composer, xcodex chat adapter, state
  genui/               OpenUI Lang catalog/parser/action bridge/React renderer
  documents/           PDF/DOCX/CSV/Markdown adapters, templates, renditions
  artifacts/           artifact model, inline cards, side panel, Tiptap editor
  contracts/           API/capability/type contracts shared by web/desktop
  workflows/           TypeScript workflow IR authoring and validation
  config/              lint/tsconfig/build presets
crates/
  core/                sessions, capabilities, approvals, local state
  agent/               xcodex host/protocol adapter
  needle/              Cactus Needle 3 C API wrapper
  sync/                iroh device identity and state/workspace sync
  workspace/           files and allowlisted shell
  sandbox/             QuickJS/wasmi/DSL execution
docs/
  cloudflare-port/     backend port and cutover history
  workspace/           this programme
```

- The web and Tauri UI share React packages; they do not share DOM-specific code with native v2.
- `apps/web` is the static React PWA deployed to Cloudflare Pages (`app.llacademy.ng`); no Pages Functions or SSR.
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
- No new feature work in `src/` legacy.
- `docs/cloudflare-port` remains the cutover archive; `docs/workspace` is the active programme.
- CI must not build the legacy SvelteKit app after retirement unless explicitly running the archive job.
