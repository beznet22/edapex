# 80 — v2 Native Mobile: React Native, Lynx or Flutter

**Draft.** v2 is not selected or started. This document defines what v2 will do and how the candidates differ.

## v2 goal

Replace the Tauri mobile WebView with a **native mobile client** while preserving:

- CF Workers as the only EdApex data and session authority
- the shared Rust core and capability semantics
- local xcodex, Needle 3, iroh, workflows, shell and sandbox
- no server-side xcodex
- one mobile runtime, not several

v2 is about native UI/performance, platform integrations, offline behavior and app-store deployment. It is not a backend rewrite.

## Shared v2 scope for all candidates

- native mobile UI
- the v1 OpenDuet surface defined in `15-ui-surfaces.md`; native GenUI parity is a separate gate below
- login with mobile tokens and Keychain/Keystore
- local Rust core through native bindings
- local Needle 3
- local xcodex host or a documented local WebView fallback
- iroh state/workspace sync
- typed workflow IR + sandbox + allowlisted shell
- CF Worker API for EdApex data
- native tab/navigation primitives; equivalent composer, transcript, tool-activity and approval behavior (the v1 interaction model from `15-ui-surfaces.md`)
- Gold on Slate tokens adapted to native styling; accessibility, safe areas and reduced motion
- the same capability/approval semantics
- no local school-record database
- no server-side xcodex

## Candidates

### React Native

**What it would do:** native RN UI; Rust core through UniFFI/JSI or Craby; Needle 3 native; iroh native; native shell; local xcodex host or local WebView.

**Strengths:** mature mobile ecosystem, native UI, existing EdApex familiarity, JS/TS workflow layer; `@openuidev/react-lang` has a native React Native entry, so GenUI can potentially be reused.

**Risks:** xcodex has no RN bridge; JSI/Craby bridge work; Needle 3 binding is new; two UI codebases (web/desktop vs mobile); native modules for shell/iroh; OpenUI RN catalog needs validation.

### Lynx / ReactLynx

**What it would do:** native Lynx UI via ReactLynx; JS logic on dual threads; Rust core through native modules; Needle 3 native; iroh; xcodex native host or local WebView.

**Strengths:** dual-thread performance, React-like model, native components, Tauri-independent mobile UI.

**Risks:** new ecosystem; no xcodex/Needle3/iroh modules; WebAssembly only Android background/partial; iOS needs native modules; migration of React web UI to Lynx components is a rewrite.

### Flutter

**What it would do:** Dart UI; Rust core via `flutter_rust_bridge`; Needle 3 native; iroh native; native shell; xcodex host or local WebView; workflow IR via Dart/Rust contracts.

**Strengths:** strong native UI/tooling and performance consistency; good FFI path for Rust.

**Risks:** Dart UI/team skill; no xcodex bridge; TS workflow interpreter cannot be reused directly; separate design-system implementation; no OpenUI renderer, so GenUI needs a custom renderer, A2UI or WebView.

## GenUI portability gate

See `21-generative-ui-openui.md`. v1 uses OpenUI Lang with `@openuidev/react-lang`. That package has a React Native native entry (optional `react-native` peer), so React Native v2 can reuse OpenUI Lang with a native component catalog.

Flutter and Lynx have no OpenUI renderer today. Before those candidates can claim GenUI parity, v2 must choose and prove one of:

- build a Flutter/Lynx OpenUI Lang renderer over the shared catalog and `lang-core`;
- adopt A2UI for those native clients;
- keep GenUI web-only inside a WebView for that candidate and accept the reduced experience.

This is a v2 gate, not v1 work. Do not promise full GenUI parity in v2 until the chosen path passes the `70` evaluation on the devices in scope.

## A2UI re-evaluation triggers (moved from `21`)

Re-evaluate A2UI vs OpenUI when at least one is true:

1. EdApex renders GenUI in Flutter, SwiftUI, Lynx or another host where the OpenUI React Native entry is not usable.
2. Third-party or remote agents return UI into EdApex.
3. A cross-host UI payload is required by an integration.
4. A native OpenUI Lang renderer is not feasible for the selected v2 runtime.

At that point, compare A2UI and OpenUI on the EdApex catalog, not on vendor benchmarks alone. A2UI is Apache-2.0 with formal AG-UI/A2A/MCP bindings — real advantages outside a React-only client. The `@openuidev/a2ui` profile is experimental, unpublished and not compatible with standard A2UI agents; do not use it as a shortcut.

## Native bindings (moved from `30`)

`edapex-bindings` (UniFFI/C ABI for native Swift/Kotlin modules) is a v2-only crate; v1 uses Tauri commands on native and WASM on web. React Native/Craby/JSI paths are v2 candidates only.

## Common blockers

- xcodex mobile host
- Needle 3 native binding and memory
- local code sandbox on iOS
- shell without process spawning
- iroh sync protocol/device identity
- local model/provider policy
- app size/weights and low-end device performance

## Decision gate

Choose v2 only after:

1. v1 Tauri/Rust/Needle/iroh benchmarks are known;
2. xcodex local host feasibility is proven on mobile;
3. Needle 3 memory and accuracy meet device targets;
4. the team can own the native runtime and build matrix;
5. v2 does not duplicate backend/auth/capability logic.

Do not start RN, Lynx and Flutter in parallel.
