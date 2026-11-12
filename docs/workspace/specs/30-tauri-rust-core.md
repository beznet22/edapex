# 30 — Tauri, React and the Rust Core

**Status:** In progress (10C). `crates/core` is scaffolded; the capability layer adds `crates/ocr`, `crates/agent`, the Tauri auth/API/capture adapters and the mobile camera plugin. `runtime_health` remains the baseline command.

## v1 platform matrix

| Surface | UI | Native execution |
|---|---|---|
| Web | React PWA | Rust core compiled to WASM; xcodex/Needle 3 WASM; iroh WASM |
| Desktop | React in Tauri 2 WebView | Rust core native; xcodex native; Needle 3 native; iroh native |
| Mobile | React in Tauri 2 WebView | Rust core native; xcodex native; Needle 3 native; iroh native |

Tauri 2 supports desktop and mobile. The WebView is the UI host, not the agent runtime.

## Rust workspace

```text
crates/
  core               sessions, capability registry, approvals, workflow IR
  agent              xcodex host/protocol adapter and dynamic tools
  ocr                RustO local OCR and model validation and dynamic tools
  ocr                RustO local OCR and model validation
  needle             Cactus Needle 3 C API wrapper
  sync               iroh device identity, state/workspace sync, AGENT_DB
  workspace          files and allowlisted shell
  sandbox            QuickJS/wasmi/DSL code execution
  documents          IronPress PDF engine (crate + WASM)
```

Directories are the short names above (matching `05-project-structure.md`); each Cargo package is `edapex-<dir>` (`crates/core` → `edapex-core`). UniFFI/`edapex-bindings` native extensions are deferred to v2 (`80-v2-native-mobile.md`).

Scaffold order (owning workstream in parentheses):

1. `core` — done (10B baseline): `runtime_health`, `CoreHealth`, `LOCAL_STATE_SCHEMA_VERSION = 1`.
2. `agent`, `ocr` — 10C: native xcodex host, dynamic tools, RustO OCR and the mobile camera bridge.
3. `sync` — follow-on: AGENT_DB storage and iroh/CF sync (`41`, `42`).
4. `documents` — IronPress native crate (`22`).
5. `needle`, `sandbox` — 10C+ (routing, execution).

Tauri mobile bring-up (10C): `tauri mobile init`, Android/iOS targets, native camera plugin and CI smoke build. The shell renders the web UI in the system WebView; `agent_connected` is true only when the native host starts.

## Bindings

- Tauri: direct Rust commands/events; no JSI.
- Web: Rust core WASM; same TypeScript contracts.
- React Native/Craby/JSI/UniFFI: deferred to v2; see `80-v2-native-mobile.md`.

## xcodex

- Tauri desktop/mobile: `codex-app-server::in_process` on a Tokio thread; Tauri commands plus a typed `tauri::ipc::Channel<AgentEvent>`.
- EdApex tools are app-server **dynamic tools** (`web_search`, `web_fetch`, `ocr_extract`), not an EdApex MCP child process. Chrome DevTools MCP remains the desktop-only user-installed browser path.
- Desktop uses the full tool profile. Mobile uses a mobile-safe profile with no shell, PTY, child process, process-based git or unrestricted filesystem.
- Fallback: local xcodex WASM in the Tauri WebView for mobile only if the native app-server build cannot be made safe. The host reports `nativeAgent: false`; tools are not faked.
- Web: xcodex WASM.
- Official xcodex UI is Svelte; the React UI uses the runtime/protocol, not the Svelte shell.

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
