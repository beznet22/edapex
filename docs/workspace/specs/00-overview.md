# 00 — Overview

**Draft.** Phase 9B handoff only.

## Product

The workspace is a local-first cowork agent harness for office work. It is not an LMS dashboard and not an SMS. EdApex is a capability/tool pack that lets the agent work with school data through the EdApex API.

## Runtime shape

```text
React UI (web PWA / Tauri WebView)
        │
        ├── OpenDuet-derived chat shell + xcodex chat adapter
        ├── OpenUI Lang generated surfaces
        ├── TypeScript workflow IR + UI state
        │
        └── Tauri invoke or WASM bridge
                │
                ▼
        Shared Rust core
          xcodex local agent
          Needle 3 local router
          capabilities/approvals
          shell + sandbox
          iroh sync
                │
                ▼
        Cloudflare Workers
          auth/session authority
          D1/R2 EdApex data
          API authorization/audit
```

## EdApex boundary

- EdApex data and user-session records live only on Cloudflare Workers.
- Local storage holds agent session/workspace state, not school records.
- API responses are ephemeral; no durable school-data cache.
- User session tokens stay in platform secure storage; they are never synchronized over P2P.
- Every school-data mutation is authorized and audited by the Worker.

## v1

- Tauri 2 desktop and mobile; React UI.
- Web PWA using the same contracts and Rust/WASM core.
- Local xcodex, Needle 3, iroh, workflows, shell and sandbox.
- UI: v1 OpenDuet surface — defined by the route-based matrix in `15-ui-surfaces.md`.
- GenUI: OpenUI Lang, read-only or assisted; authoritative workflows stay in fixed React. See `21-generative-ui-openui.md`.
- Implementation is sequenced, not feature-deferred: core shell first, then the remaining workspace surfaces.

## v2

Native mobile candidate milestone: React Native, Lynx or Flutter. v2 replaces Tauri mobile WebView only; it keeps the Rust core, CF Workers authority and same capability/user semantics.

## Sources

- `docs/cloudflare-port/ROADMAP.md`, `PROGRESS.md`, cutover decisions and checklist
- `docs/workspace/extracted-ui-spec.md`
- `docs/agent_migration_prompt.md`
- `docs/cloudflare-port/04a-auth-cutover.spec.md`
