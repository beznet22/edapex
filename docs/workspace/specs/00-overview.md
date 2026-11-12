# 00 — Overview

**Draft.** Phase 9B handoff only.

## Problem

LL Academy school office work — records, reports, placements and staff/parent provisioning — currently runs through a legacy SvelteKit app that mixes UI, data access and agent features in one deployment. The workspace programme replaces it with a local-first cowork agent harness: a chat-first UI over school data through the EdApex Worker API, with every school-data mutation authorized and audited server-side. The legacy app is retired, not rebuilt (see `06-legacy-archive.md`).

## Product

The workspace is a local-first cowork agent harness for office work. It is not an LMS dashboard and not a School Management System (SMS). EdApex is a capability/tool pack that lets the agent work with school data through the EdApex API.

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

Terms and acronyms (xcodex, Needle 3, iroh, D1/R2, workflow IR, shell) are defined in `90-glossary.md`.

## EdApex boundary

- EdApex data and user-session records live only on Cloudflare Workers.
- Local storage holds agent session and workspace state — transcripts, tool results and session-derived artifact content — never an authoritative copy of school records. API responses are used in-session; the only durable local school-derived content is the retention-bounded transcript store (`60-security-privacy.md`).
- User session tokens stay in platform secure storage; they are never synchronized over P2P.
- Every school-data mutation is authorized and audited by the Worker.

## v1

- Tauri 2 desktop and mobile; React UI.
- Web PWA using the same contracts and Rust/WASM core, built as a Next App Router app through vinext and deployed as a Cloudflare Worker with static assets.
- Local xcodex, Needle 3, iroh, workflows, shell and sandbox.
- UI: the route-based surface matrix in `15-ui-surfaces.md`; Gold on Slate visual primitives in `19-design-system.md`.
- Chat/runtime state and xcodex mapping: `17-chat-framework.md`.
- GenUI: OpenUI Lang, read-only or assisted; authoritative workflows stay in fixed React. See `21-generative-ui-openui.md`; A2UI is deferred in v1.
- Implementation is sequenced, not feature-deferred: core shell first, then the remaining workspace surfaces.
- Specification authority is summarized in [`README.md`](../README.md#specification-authority); do not treat overlapping specs as equal authority.

## Success metrics

- Zero `60-security-privacy.md` boundary violations across workstreams (per-workstream gate).
- Performance budgets met or formally excepted per `47-performance-budgets.md` (release gates).
- Claim completion rate for provisioned staff/parent accounts, recorded in `PROGRESS.md`.
- Legacy retirement gates pass in order (`06-legacy-archive.md`); rollback window closes before any delete.

## v2

Native mobile candidate milestone: React Native, Lynx or Flutter. v2 replaces Tauri mobile WebView only; it keeps the Rust core, CF Workers authority and same capability/user semantics.

## Sources

- `docs/cloudflare-port/ROADMAP.md`, `PROGRESS.md`, cutover decisions and checklist
- `docs/workspace/specs/90-glossary.md` — terms and acronyms
- `docs/workspace/extracted-ui-spec.md`
- `docs/agent_migration_prompt.md`
- `docs/cloudflare-port/04a-auth-cutover.spec.md`
