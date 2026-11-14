# 30 — Tauri, React and the Rust Core

**Status:** In progress (10C). `crates/core` is scaffolded; the capability layer adds `crates/ocr`, `crates/agent`, `crates/agent-wasm`, `crates/store`, the Tauri auth/API/capture adapters and the mobile camera plugin. `runtime_health` remains the baseline command.

## v1 platform matrix

| Surface | UI | Native execution |
|---|---|---|
| Web | React PWA | Rust core compiled to WASM (`crates/agent-wasm`); host `fetch` transport |
| Desktop | React in Tauri 2 WebView | Rust core native; host `reqwest` transport |
| Mobile | React in Tauri 2 WebView | Rust core native; host `reqwest` transport |

Tauri 2 supports desktop and mobile. The WebView is the UI host, not the agent runtime.

## Rust workspace

```text
crates/
  core               sessions, capability registry, approvals, workflow IR
  agent              thin provider-neutral runtime: provider stream → tools → approvals
  agent-wasm         cdylib + wasm-bindgen wrapper for the browser surface
  store              local SQLite, per-record encryption, sync outbox
  ocr                RustO local OCR and model validation
  needle             Cactus Needle 3 C API wrapper
  workspace          files and allowlisted shell
  sandbox            QuickJS/wasmi/DSL code execution
  documents          IronPress PDF engine (crate + WASM)
```

Directories are the short names above (matching `05-project-structure.md`); each Cargo package is `edapex-<dir>` (`crates/core` → `edapex-core`). UniFFI/`edapex-bindings` native extensions are deferred to v2 (`80-v2-native-mobile.md`).

There is **no `crates/sync`**. Device sync is server-mediated through `AGENT_DB`; iroh is deferred (`41-storage-sync.md`). A `Transport` trait ships unimplemented so a future transport has a seam.

Scaffold order (owning workstream in parentheses):

1. `core` — done (10B baseline): `runtime_health`, `CoreHealth`, `LOCAL_STATE_SCHEMA_VERSION = 1`.
2. `agent` — 10C: provider → tools → approvals. **The only agent runtime.**
3. `agent-wasm`, `ocr` — 10C: browser surface and RustO OCR with the mobile camera bridge.
4. `store` — chunk 2: local SQLite, per-record XChaCha20-Poly1305, `sync_outbox`.
5. `documents` — IronPress native crate (`22`).
6. `needle`, `sandbox` — 10C+ (routing, execution).

Tauri mobile bring-up (10C): `tauri mobile init`, Android/iOS targets, native camera plugin and CI smoke build. The shell renders the web UI in the system WebView; `agent_connected` is true only when the native host starts.

## Bindings

- Tauri: direct Rust commands/events; no JSI.
- Web: Rust core WASM (`crates/agent-wasm`); same TypeScript contracts.
- React Native/Craby/JSI/UniFFI: deferred to v2; see `80-v2-native-mobile.md`.

## The thin core

- Desktop/mobile: `crates/agent` runs natively; the Tauri host injects `reqwest`, the tool executor, the approval handler and a typed `tauri::ipc::Channel<AgentEvent>`.
- Web: the same crate compiles to WASM; the browser host injects `fetch`.
- The core carries **no TLS stack and no HTTP client**. Transport is a host concern.
- EdApex tools are core **dynamic tools** (`web_search`, `web_fetch`, `ocr_extract`), executed in process by the host. They are not an MCP child process.
- Desktop uses the full tool profile. Mobile uses a mobile-safe profile with no shell, PTY, child process, process-based git or unrestricted filesystem.
- AG-UI is the **external-agent** boundary (`17-chat-framework.md`); it is not the internal transport.
- Official OpenDuet UI is React; the EdApex UI uses the runtime/protocol, not the Svelte shell.
- The WebView never holds an EdApex bearer token or a provider key.

### OCR and capture

- `crates/ocr` bundles RustO 0.3.2 / PP-OCRv6 tiny; models are pinned, checksum-verified and fetched at build time.
- Tauri commands: `capture_screen`, `capture_import`, `capture_import_path`, `ocr_extract`, `ocr_mistral`.
- Desktop uses file import and configurable `xcap` screenshots. Mobile uses the first-party camera plugin (`48`); there is no desktop camera preview.
- The WebView never receives `MISTRAL_API_KEY`; cloud OCR goes through the consent-gated API.

## Needle 3

- Web: Needle 3 WASM.
- Desktop/mobile: Cactus native C API through `edapex-needle`; `bindgen`; per-ABI libraries.
- `react-native-needle` is not the target: Needle 2, Android arm64, iOS unwired; ~500–530MB RSS reported upstream, unverified — measure during 10B mobile bring-up.
- Benchmark 4/8/20-layer subnetworks against the memory budget in `47-performance-budgets.md`.

## Generated UI

- OpenUI Lang is parsed and rendered in the React layer (`packages/genui`).
- The Rust core emits a surface event and validates closed action IDs; it does not render UI.
- No generated HTML/JavaScript reaches the Tauri/WebView main runtime; the host CSP is currently `null` in `tauri.conf.json` — hardening it (script-src self, no remote origins) is 10B work recorded here.
- The surface catalog and token budget are defined in `21-generative-ui-openui.md`.

## Cloudflare Workers

Workers remain responsible for:

- auth and session records
- D1/R2 EdApex data
- API authorization and mutation audit
- public application endpoints

The local Rust core has no school-record database. It calls the Worker API and treats responses as ephemeral.
