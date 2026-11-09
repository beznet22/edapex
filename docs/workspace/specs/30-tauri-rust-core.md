# 30 — Tauri, React and the Rust Core

**Draft.** No implementation in Phase 9B.

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
  edapex-core        sessions, capability registry, approvals, workflow IR
  edapex-agent       xcodex host/protocol adapter
  edapex-needle      Cactus Needle 3 C API wrapper
  edapex-sync        iroh device identity and state/workspace sync
  edapex-workspace   files and allowlisted shell
  edapex-sandbox     QuickJS/wasmi/DSL code execution
  edapex-bindings    UniFFI/C ABI if a native platform module is needed
```

## Bindings

- Tauri: direct Rust commands/events; no JSI.
- Web: Rust core WASM; same TypeScript contracts.
- UniFFI: optional native Swift/Kotlin extensions.
- React Native/Craby/JSI: deferred to v2; not part of v1.

## xcodex

- Tauri desktop/mobile: xcodex Rust host if the core can be adapted to mobile platform capabilities.
- Fallback: local xcodex WASM in the Tauri WebView.
- Web: xcodex WASM.
- Official xcodex UI is Svelte; the React UI uses the runtime/protocol, not the Svelte shell.

## Needle 3

- Web: Needle 3 WASM.
- Desktop/mobile: Cactus native C API through `edapex-needle`; `bindgen`; per-ABI libraries.
- `react-native-needle` is not the target: Needle 2, Android arm64, iOS unwired, ~500–530MB RSS.
- Benchmark 4/8/20-layer subnetworks; memory is the first-class constraint.

## Generated UI

- OpenUI Lang is parsed and rendered in the React layer (`packages/genui`).
- The Rust core emits a surface event and validates closed action IDs; it does not render UI.
- No generated HTML/JavaScript reaches the Tauri/WebView main runtime.
- The surface catalog and token budget are defined in `21-generative-ui-openui.md`.

## Cloudflare Workers

Workers remain responsible for:

- auth and session records
- D1/R2 EdApex data
- API authorization and mutation audit
- public application endpoints

The local Rust core has no school-record database. It calls the Worker API and treats responses as ephemeral.
