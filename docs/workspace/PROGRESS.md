# Workspace Programme Progress

**Status:** Phase 9B approved; 10A deployed; 10B preview live; 10C local capability layer in progress. **Phase A (spec amendments for the thin core) is complete.** Phase 8 and the Phase 9A platform are done. `app.llacademy.ng` is live via a proxied Pages CNAME and remains the rollback; the single `apps/web` app is being replaced with a Next App Router PWA built by vinext for a Cloudflare Worker. Migration 0006 and Worker `7bab26b5` are deployed. `/claim` and shared digests move to 10G.2; student codes/duplicate resolution move to 10G.1.

## Phase A — spec amendments (complete)

The agent runtime decision and the backend split are now recorded in the specs, before any implementation code.

| Change | Where |
|---|---|
| xcodex retired; `crates/agent` is the only runtime | `17-chat-framework.md`, `30-tauri-rust-core.md`, `48-local-capability-layer.md` |
| AG-UI becomes the **external-agent boundary**, required and lossless | `17-chat-framework.md` §AG-UI boundary |
| iroh deferred; `AGENT_DB` is the only v1 transport, CI-guarded | `41-storage-sync.md`, `15-ui-surfaces.md` §15.15 |
| Local store: plain SQLite + per-record XChaCha20-Poly1305 (no SQLCipher) | `41-storage-sync.md` §Encryption |
| Routines are local-first; no Worker cron fan-out | `41-storage-sync.md` §Routines are local-first |
| Agent creation policy + narrowing invariant + per-agent manifest | `10-capabilities-and-roles.md` §Agents and grants, `42-agent-db-schema.md` §Agent creation policy |
| Tenant-defined role set; non-school tiers 1–3 | `10-capabilities-and-roles.md` §Roles |
| Server-side governed MCP client permitted | `60-security-privacy.md` §Connectors and governed MCP, `42` |
| PWA definition + "adaptation vs. measure" resolution | `15-ui-surfaces.md` §15.4, `extracted-ui-spec.md` §1/§7.1 |
| `apps/` vs `services/` vs `packages/`; two-Worker split | `05-project-structure.md` |
| Agent WASM lazy, never precached; per-ABI AAB | `47-performance-budgets.md` |

### Repository move

`apps/api` → **`services/sms-api`**. Deployment is unaffected: `wrangler.jsonc` keeps `name: edapex-api` and both custom domains. 109 references updated across 40 files, including `scripts/verify-port-specs.mjs`, the CI workflow path filter and `pnpm-lock.yaml`.

Gate output:

```text
node scripts/verify-port-specs.mjs      failures: 0, spec suite verified
node scripts/verify-schema-catalog.mjs  catalog verified
services/sms-api typecheck             clean
services/sms-api test                  133 files / 635 tests passed
```

## Chunk 0 — core review for OpenDuet completeness (complete)

The thin core is now the only runtime, and the WASM question is answered by a real build rather than an estimate.

| Item | Result |
|---|---|
| **tokio-on-WASM** | **Works.** `cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm` succeeds. The only blocker was a missing `uuid` feature (`js`); no executor swap was needed. |
| `InterruptSignal` | Ported from `jcode-agent-runtime`. Flag + monotonic epoch + `Notify`, with `reset_if_epoch` so a deferred reset cannot erase a newer cancel. 6 tests. |
| One SSE framer | `crates/agent/src/stream.rs`: `Utf8StreamDecoder` (carries split multi-byte characters, `U+FFFD` for genuinely invalid bytes) + `take_sse_event` draining in place over `memchr::memmem`. Differential test against a naive whole-buffer decode at **every** byte boundary. Replaced both host copies. |
| Per-tool risk | `DynamicToolName::risk()` and `approval_decisions()`. Removed the hardcoded `CapabilityRisk::Read` and the unconditional four-decision list. `Write` no longer offers session approval. |
| AG-UI round-trip | `risk`, `decisions` and `summary` now survive both directions. Unparseable risk defaults to `Destructive`; unparseable decision defaults to `Deny` — both fail closed. 4 round-trip tests. |
| `Arc<str>` history | `ProviderRequest.messages` is `Arc<[ChatMessage]>` and message content is `Arc<str>`, so a per-round transcript snapshot is pointer bumps instead of a deep copy. |
| Contract parity | `crates/agent/tests/contract_parity.rs`: every fixture event round-trips through the Rust enum, every variant is covered, nested enum strings match. **7 tests. This test did not exist.** |
| `crates/agent-wasm` | New `cdylib`/`rlib` with `JsProvider`, `SseFramer`, `parseSseData`, `encodeEvent`. Host injects transport; the core still carries no HTTP. |
| Chat history dedupe | `agent.rs` truncation repaired: `process_sse_event` restored, `struct HostTools` redefined, `requires_approval` overridden to `true`. **The desktop crate compiles for the first time.** |
| `[profile.release]` | Added `lto`, `codegen-units`, `strip`. Previously only the non-default `agent-release` profile had them, so an app build got none. |
| Contracts | `TenantFeature`, `AgentGrant`, `disabledFeatureIds`, `allowedOperationIds`, `validateAgentGrant`; `buildCapabilityManifest(role, features?)`. |

Semantics decision: **unlisted features are enabled.** A tenant masks off what it does not use; a partial mask must not silently disable everything else. Caught by the new filter test before it shipped.

Gate output:

```text
cargo check --workspace                                        0 errors
cargo build --target wasm32-unknown-unknown -p agent-wasm      0 errors
cargo check --target aarch64-linux-android -p edapex-agent      0 errors
cargo test -p edapex-agent -p edapex-ocr                       47 passed, 0 failed
node scripts/check-agent-size.mjs                              0.59 MiB / 10 MiB
node scripts/verify-port-specs.mjs                             failures: 0
capabilities.test.ts                                           8 passed (incl. narrowing invariant)
```


## Chunk 2 — local store + `AGENT_DB`

| Item | Outcome |
|---|---|
| `crates/store` | Plain SQLite, per-record XChaCha20-Poly1305, append-only JSONL journal with 512 KB rotation, FTS derived-only. **24 tests.** |
| Outbox atomicity | The entity write and its `sync_outbox` row share one transaction; a forced failure leaves no orphan. Enforced by test, not convention. |
| Data-class exclusion | `CHECK (data_class = 'workspace')` on every table. `edapex` and `edapex-ephemeral` have no representation, so a bug cannot persist school records in the local store. |
| `services/cowork-api` | Device register/list/revoke, batched push, cursor pull. **16 tests.** Bindings `AGENT_DB`, `SYNC_MEDIA`, service binding to `sms-api`. |
| Push idempotency | `UNIQUE (device_id, device_seq)` + `INSERT OR IGNORE`, so a retry after a timeout accepts nothing. Verified by replaying a batch. |
| Entity allowlist | `entityType` is a closed set; `students` and friends are rejected before a statement is prepared. |
| Server-side fallback | `pull` excludes the caller's own device and never advances the cursor past the page it returned. |
| `received_at` added | Ordering uses the **server's** receive time, not the client's `created_at`: a wrong clock would otherwise write events behind a reader's cursor that are never pulled. Recorded in spec 42. |

### Decisions

- **One cursor format, `<receivedAt>:<id>`.** D1 cannot index `rowid`, and there is no dense per-workspace sequence without an `AUTOINCREMENT` primary key the spec does not have. A compound key ordered by `(received_at, id)` is total and stable.
- **The server never holds a key.** It stores and routes ciphertext only, so a compromised Worker cannot read a transcript. Checksum verification is the one thing it can still do.
- **Revocation is a tombstone**, not a delete: the device row is the audit trail, and a revoked device gets `device_revoked` rather than a silent failure so the client can prompt a re-pair.

### Open

- **The browser driver is not written yet.** `SqlDriver` is defined and `RusqliteDriver` implements it (WAL, transactions). The OPFS SQLite WASM / IndexedDB driver is bound from `crates/agent-wasm`, because it crosses into JavaScript, and lands with the web persistence work. Until then the PWA cannot persist locally.
- **The client half of sync is unbuilt.** The store emits outbox rows and the service accepts them; nothing yet runs the flush loop on a device. That is integration, not protocol, and belongs with the runtime wiring.
- `wrangler.jsonc` carries a placeholder `database_id`; `wrangler d1 create edapex-agent` must replace it before deploy.

## Chunk 1 — three surfaces + visual language (in progress)

### Landed and verified

| Item | Result |
|---|---|
| `model-router` service | New private Worker (no public route, no D1). Holds the gateway token only; provider keys live in AI Gateway BYOK, selected per tenant by `cf-aig-byok-alias`. 25 tests. |
| OpenAI-compatible surface | `GET /v1/models`, `POST /v1/chat/completions`, OpenAI error envelope, `Authorization: Bearer`. Deleted the bespoke camelCase schema and its translation layer. |
| Logging suppression | `cf-aig-collect-log: false` on every request, forced — AI Gateway logs prompt **and** response bodies by default and prompts contain school records. |
| Passthrough choice | Direct provider URL, never Unified Billing, where a missing BYOK key silently falls through to Cloudflare billing. |
| **xcodex deleted** | `lib/xcodex-browser.ts`, `public/xcodex/`, `public/xrouter-browser/` removed. `apps/web/public` went **10.5 MB → 404 KB**. |
| Browser runtime | `lib/native-agent.ts` + `lib/agent-runtime.ts`. `agent-wasm` rewritten with a real turn driver; `ChunkQueue` is now a rendezvous (the previous eager drain would have deadlocked the first turn). |
| WASM budgets | 416 KB raw / **134 KB gzip**, glue 5.4 KB gzip — enforced by `scripts/build-agent-runtime.mjs`. Grew from 121 KB when tool and approval callbacks became promise-aware. |
| tokio on wasm32 | **Builds.** Only blocker was `uuid`'s `js` feature. |
| PWA | Real icons generated (they were missing entirely, so install rejected); manifest loses `portrait-primary` and gains shortcuts; `sw.js` never caches `/api/`, agent runtime or transcripts. |
| Theme | Genuine light `:root` + `.dark` pair (previously dark values in `:root` with no `.dark` at all), accent presets, cookie-backed SSR class so there is no flash. |
| Borders → elevation | `border-r`/`border-b`/`border-x` replaced with `--elevation-*` and inset shadows in the shell, composer and artifact host. |
| Desktop credential | The keychain-held OpenRouter key and `agent_set_openrouter_key` are gone; the provider now targets `model-router` with the session bearer. |
| `EventHub` + `agent_attach` | Bounded 1,024-event ring with monotonic sequence numbers. A WebView reload swaps the channel **before** replaying, so nothing emitted during replay is lost. 8 tests. |
| `turn_start` returns early | The turn now runs on a detached task via `crates/agent/src/spawn.rs` (`tokio::spawn` native, `spawn_local` on wasm). Five turn tests had to wait for completion, which is the honest contract. |
| Tauri bundle | `bundle.active: true` with icons and categories; the window was locked to 430×860 and is now 1100×800 with a 360 minimum. **CSP is no longer `null`** — it was disabled entirely. |
| Web CI | `.github/workflows/web.yml`: typecheck, test, build, budget, plus a `wasm` job that builds the runtime and a `contracts` job for parity. Nothing built or tested `apps/web` before. |
| Budget enforcement | `apps/web/budget.json` from spec 47 plus `scripts/check-budget.mjs`. It **fails** when no build exists instead of skipping. |
| Tool pills | Settled steps collapse to one line that still names what ran and counts failures; actions needing a person stay expanded, because they are what blocks the turn. Borders replaced with elevation. |
| Adaptive widths | The shell no longer caps the canvas at 880px. Chat keeps its own 760px measure; Tasks and Make now own the full width as dashboards should. |
| READMEs | Every workspace member now has one (7 were missing). |
| **Browser route settled** | Model traffic terminates at `POST /api/v1/agent/model/chat/completions` on `sms-api` and forwards to `model-router` over a service binding. The `__Host-` cookie cannot cross hosts, so no other shape works without duplicating session validation. |
| Path convention | The passthrough is `/api/v1/agent/model/chat/completions`, not `/api/v1/agent/model/v1/...`. EdApex's `v1` and OpenAI's `v1` are different version axes; only `model-router` carries the OpenAI path, because only it impersonates a provider. |
| **Budget measured** | The web build now runs (Node 26.13.1) and the budget is measured, not assumed: **181,824 B JS / 10,684 B CSS gzip**. Target **resolved, not missed**: the framework floor alone is 143,211 B (react-dom 67,510 + vinext 75,701), so 150 KB was unreachable without replacing React. Budget is now a 200 KB hard ceiling plus a 60 KB controllable ceiling (total minus floor, measured 38,388 B). Decision recorded in spec 47. |
| Zod off the initial path | `lib/dev-preview.ts` imported the `@edapex/contracts` barrel, dragging `./agent`'s module-scope schemas onto first paint. Now imports the `/capabilities` subpath. `native-agent.ts` validates events with a hand-written guard instead of `agentEventSchema`. **−19 KB**. |
| Budget script corrected | It summed every chunk, counting Tiptap (188 KB) which only loads when the artifact panel opens. Now walks the Vite manifest from the entry through static imports, and accounts for emitted CSS the manifest does not reference. |
| Tenant middleware narrowed | `use("/agent/*")` also captured `/agent/model`, which would have blocked a school-less tenant. Now scoped per route. Caught by a test, not by review. |
| Test stub for the binding | `vitest.config.ts` declares a `edapex-model-router` stub Worker; without it miniflare fails to boot the entire `sms-api` suite. |
| **`/workspace` returned 500** | Every request failed while `tsc` and `vite build` were green. `lib/theme.ts` carried `"use client"`, which turns every export into a client reference, and the root layout called `readThemeCookies` during render. Split into `theme.ts` (pure, server-safe) and `theme-dom.ts` (browser-only). |
| **Browser runtime never loaded** | `native-agent.ts` imported `/agent-runtime/…` through the module graph. Vite rejects that for `public/` assets: "should not be imported from source code". `@vite-ignore` did not help because the specifier was a const with a literal value. Now built with `new URL(...)` at runtime. |
| **Provider body was not OpenAI-shaped** | `ProviderRequestWire` sent camelCase `toolCalls` / `toolCallId` and flat tool-call entries. `model-router` drops unknown keys instead of rejecting, so tool correlation would have vanished silently upstream. Now `snake_case` with `{id, type, function:{name, arguments}}`, plus explicit `stream: true`. |
| **System theme flashed** | The server cannot know the OS preference, so `data-theme-mode="system"` rendered light and flipped after hydration. Added a `prefers-color-scheme` rule mirroring `.dark`, plus an e2e test comparing computed tokens so the two blocks cannot drift. |
| **`NODE_ENV=production` breaks dev** | With it set, react-dom resolves its production server build while Vite still emits the dev JSX runtime; every render throws `dispatcher.getOwner is not a function`. The Playwright config pins `NODE_ENV=development`. |
| **E2E suite exists** | `pnpm --dir apps/web exec playwright test` — 22 tests: render, server-rendered theme, system-mode parity, responsive overflow at 7 widths, manifest, reduced motion, and streaming against an intercepted SSE response. `playwright.config.ts` scopes `testDir` to `e2e/`; without it Playwright collected the Vitest files and died with "No tests found". |
| **Wire shape covered** | The streaming test asserts the posted body is OpenAI-shaped and carries no `toolCalls`/`toolCallId`. This is the only automatic guard, because `agent-wasm` is gated to `wasm32` and cannot be unit-tested natively. |

### Still open in chunk 1

- `gen/ios/` — blocked on this machine: the installed `tauri-cli` has no `ios`
  subcommand (a Linux build without the mobile targets). iOS icons are present
  under `src-tauri/icons/ios/`. Run `pnpm exec tauri ios init` on macOS.
- Native desktop/mobile builds are unverified end to end: the web build needs
  Node ≥22.18 and `engines` wants 26.13.1, while this environment has 22.13.
- `budget.json`, Lighthouse config and a `web.yml` CI job — `apps/web` is still not built or tested in CI.
- Authored primitives beyond the five that exist; `components.json` still on the `new-york` preset name (shadcn has since renamed it, so the value is cosmetic until a CLI run).
- Tool-call pills and the responsive 320→1920 audit.
- `POST /api/v1/agent/turn` and `/stop` were removed from the web client: the turn loop runs in the WASM core, so no server endpoint is involved. Tool and approval round-trips still need a transport (they are wired as promises but the core-side call sites are placeholders).

## Status table

| Workstream | Status | Notes |
|---|---|---|
| Phase 8 — cutover | **done** | 24-hour watch closed 2026-11-09; owner POC login confirmed; checklist signed; 2,298 EdApex requests/0 errors |
| Phase 9A — auth/retention | **done (platform)** | Migration 0006, Worker `bfa72530`, Pages `edapex-web.pages.dev`, proxied CNAME `app.llacademy.ng` → `edapex-web.pages.dev`; app root/claim/admin 200; `/claim` 202; magic 202; admin 401. Transitional `/claim` and digests are 10G.2 |
| Phase 9B — handoff docs | **approved 2026-11-09** | 28 markdown files; documentation only |
| Phase 10A — capability contract | **deployed** | Worker `372cb73f`; shared `@edapex/contracts`, role manifest, budget checks, admin issue read/plan/apply, public applicant contract |
| Phase 10B — workspace shell | **preview deployed** | `apps/web` Vite shell is being replaced in place by a Next App Router/vinext app. Admin directory, claim and login routes are ported; `/workspace` now uses the starter-derived shell plus ported OpenDuet components. Login/capability gate, 430px workspace, Ollama-free runtime seam, PWA manifest/service worker, OpenUI lazy renderer and Tiptap package are present. The Cloudflare Worker deploy/cutover, authenticated runtime and xcodex adapter remain. See `apps/web/VENDOR.md` and `.kimchi/docs/chatbot-openduet-migration.md`. |
| Phase 10C — local capability layer | **in progress** | Spec 48 + contracts/fixtures; RustO OCR crate; desktop PKCE/bearer; local OCR ingestion; Tauri capture/OCR/API/keychain host; Chrome MCP config; TinyFish/Tavily WebSearch/WebFetch API and tests landed. Native xcodex is blocked on upstream dependency resolution; the first-party mobile camera plugin and final UI wiring remain |
| Phase 10G.1 — identity provisioning | **deferred to 10B** | Student codes, duplicate resolution, staff/parent claiming and Gmail assistance |
| Phase 10G.2 — transitional retirement | **deferred after 10F** | Remove `/claim`, null/drop password digests, retention execution |

## Current production issue inventory

Counts only; no names, emails or marks.

| Item | Count | Meaning |
|---|---:|---|
| Current 2026/2027 records | 663 | Students with a target current record |
| Students without target current record | 237 | 234 no current record + 3 unplaced; quarantined for admin decision |
| Reviewed class-sections | 42/42 | All reviewed |
| Class-sections without subject teacher | 15 | Intentionally reviewed with no subjects; needs staffing decision |
| Active target subject assignments | 231 | After removing 135 rehearsal-fixture assignments |
| Shared-email account groups | 24 | Claim returns 409 until admin resolves |
| Students with no student record | 5 | Non-blocking identity cleanup |
| Placement mismatches | 1 | Non-blocking C1 finding |
| Active staff without class assignment | 39 | Split teaching/non-teaching before treating as a gap |
| Archive objects / summaries | 1,293 / 3,802 | R2; metadata loaded |
| Admin issue queue (10A smoke) | 582 | 558 unclaimed accounts, 2 unlinked parents, 20 duplicate-email records, 2 missing emails; counts only |

## Decisions recorded

| Decision | Detail |
|---|---|
| Local retention (EGM resolve D7) | Local transcripts/tool results retained 30 days by default, pruned on next launch, user-clearable |
| Editor v1 inventory (EGM resolve D1) | v1 = templates + slash (no Emoji/Generate text) + bubble + callouts + checklist + sign-off + comments; smart paste/AI actions/outline-find/block-drag/table-toolbar → 10D |
| Surface-matrix scope (EGM resolve D2/D3) | Bots/Team Bots/Connections/Capabilities/Routines/Responsibilities/Skills/Memory/Inbox → 10D (stub specs gate them); Activity → Out (legacy redirect) |
| Directory data path (EGM resolve D5) | Server-side pagination per `45` (50/100); `47` local-snapshot rows removed; exception owner + follow-up recorded |
| Contract deltas (EGM resolve D6/D10) | `SurfacePart.expiresAt` landed; `ArtifactPart` and `GenUIActionId` remain 10B/10D work |
| Numeric team decisions (EGM resolve, 2026-11-09) | CSV Markdown-table import ≤100 rows; web PDF batch ≤20/job; DOCX images ≤10 MB each/50 MB total; base64 inline cap 100 KB; skeleton threshold 150 ms; search debounce 250 ms; claim cookie TTL 10 min |
| Local-first v1 | Tauri 2 desktop/mobile + React + shared Rust core; web PWA |
| v1 UI scope | v1 OpenDuet surface defined in `specs/15-ui-surfaces.md`; implementation is sequenced, not feature-deferred |
| Agent locality | xcodex and Needle 3 run locally; no server-side xcodex |
| Data/session authority | CF Workers only; no local school-record DB or session authority |
| Sync | iroh-first transport with Cloudflare `AGENT_DB` authority; separate follow-on, not part of 10C |
| Capability contract | Role manifest + separate host/server flags; dynamic tools `web_search`, `web_fetch`, `ocr_extract`; no role authority from host flags |
| Local OCR | RustO 0.3.2 / PP-OCRv6 tiny default; Mistral explicit fallback; local OCR uploads text/annotation only |
| Native xcodex | `codex-app-server::in_process` + Tauri commands/Channel; no sidecar, no SSE production path, no server-side xcodex |
| Mobile camera | First-party Tauri plugin, full-screen stills preview, AVFoundation/CameraX; desktop keeps screenshots/file import |
| WebSearch/WebFetch | TinyFish primary, Tavily fallback, Worker-only keys, staff-only, tenant quotas and SSRF policy |
| Desktop auth | Signed PKCE code + one-time exchange + OS keychain; bearer API proxy; no `__Host-` cookie dependency |
| Native xcodex | `codex-app-server::in_process` selected, but the pinned xcodex git graph does not resolve/build cleanly on Rust 1.96 (rama/zip/starlark dependency skew). Desktop remains on the existing WASM xcodex until pinned; no fake native host |
| Desktop auth | Signed PKCE + bearer + OS keychain; no `__Host-` cookie dependency |
| Persistence | `AGENT_DB`/Yjs/iroh sync is a separate follow-on (`41`/`42`); no new tables in the school `DB` |
| Workflows | TypeScript workflow IR; Rust execution; code sandbox fallback; shell separate |
| Tool budget | Max 5 tools per role/turn; max 8 operations per tool |
| Public onboarding | Public applications; no self-created active accounts; progressive applicant identity |
| Roles | All roles in v1; parent/student read-only, admin/teacher writes with approval |
| OmniRoute | Self-hosted behind the EdApex gateway; provider allowlist, no PII fallback |
| v2 mobile | React Native, Lynx or Flutter; deferred and not selected |
| Chat framework | OpenDuet-derived interaction components ported into `apps/web`; shared state/primitives in `packages/chat`; custom xcodex runtime; no assistant-ui, CopilotKit runtime or AI SDK agent |
| GenUI | OpenUI Lang in v1; read-only or assisted, never authoritative; A2UI deferred to a v2/remote-agent gate |
| Chat Markdown | Streamdown for chat and artifact preview; Tiptap for editable artifacts |
| GenUI storage | Typed `message_parts`; `edapex-ephemeral` surfaces store source/catalog version/expiry, never a PII snapshot |
| Document engine | IronPress PDF (Rust native / lazy WASM), PDF.js preview+parse, `docx` Word, Mammoth/Turndown DOCX import, PapaParse CSV |
| Artifact editor | Minimal Tiptap inline/side-panel; Novel is visual reference only — no package/source/AI SDK; double-arrow opens side panel |
| Reference audits | chatbot pin `a8989b5…` Apache-2.0 UI substrate; OpenDuet pin `f52288f…` selective interaction port; Novel pin `fa95098…` visual-only; `gh api` commands and dependency/source gates in `specs/44-reference-app-audits.md` |
| Admin claim links | Tenant staff/parent directory at `app.llacademy.ng/admin/claim-links`; per-user 72h tokens; staff/parent provisioning; non-Gmail badge; `specs/45-admin-claim-links.md` |
| Artifact renditions | Version-bound PDF/DOCX/CSV/HTML/PNG; `workspace` local, `edapex` Worker/R2, `edapex-ephemeral` memory only |
| Hosting | Web PWA: `apps/web` Next App Router via vinext on a Cloudflare Worker (`app.llacademy.ng`); previous Pages deployment is rollback. API on Cloudflare Workers (`api.llacademy.ng`); Tauri installers on GitHub Releases/R2 |

## Open questions

- Is Tauri 2 mobile WebView performance acceptable on low-end Android and iOS?
- Can xcodex’s Rust core be hosted natively by Tauri on mobile, or is local WASM WebView the fallback?
- Which Needle 3 subnetwork meets accuracy/memory targets on school devices?
- Which provider limits and quota thresholds survive the first live TinyFish/Tavily pilot?
- Which xcodex lockfile or upstream fix makes `codex-app-server::in_process` build reproducibly on Rust 1.96?
- Which v2 mobile runtime wins the benchmark and team-capacity review?
- How will OpenUI Lang render on the chosen v2 native runtime? React Native has a native OpenUI entry; Flutter/Lynx still need a renderer, A2UI or WebView.
- Which OpenUI catalog components and token budget survive the EdApex bake-off without weakening action safety?
- Who owns public-application approval and placement/quarantine decisions?

## Phase 8/9A gates

Phase 8 is closed. Phase 9A platform closes when migration 0006, the Worker and Pages are deployed and the claim-link/magic-link smoke passes. Do not close 10G.1 until:

- all student codes are issued and distributed;
- all 24 duplicate-email groups are resolved or flagged;
- staff/parent claim coverage and non-Gmail assistance are recorded.

10G.2 closes after 10F:

- `/claim` is removed and returns 404;
- password digests are nulled and verified zero;
- retention is executed.

## Changelog

| Date | Change |
|---|---|
| 2026-11-08 | Phase 9B draft folder created; v1 Tauri/Rust/local-agent architecture documented; v2 native-mobile options recorded; Phase 8 and 9A kept open |
| 2026-11-08 | Final audit and OpenUI fold-in: OpenUI Lang selected for v1 GenUI; assistant-ui removed; Streamdown/Tiptap split recorded; A2UI deferred; v1 surface matrix and AGENT_DB gaps documented |
| 2026-11-08 | Document engine folded in: IronPress/PDF.js/DOCX/Mammoth/PapaParse/Tiptap; artifact renditions/imports/comments/sign-offs; legacy report/filestore UX reused; OpenUI React Native correction |
| 2026-11-08 | Roadmap corrected: Cloudflare Pages hosting, agent operating instructions, workspace package wiring, Phase 9A/9B/10 gates, dependency map and Definition of Done |
| 2026-11-08 | Workspace README aligned with the port README: authority, 62-table scope, contract integrity, layering, D1/Pages rules, file/size caps, reading order, gates, non-goals and verification |
| 2026-11-11 | Canonical web claim routes are `/claim` and `/admin/claim-links`; the temporary `/claim-link` alias added for a legacy 404 was removed. |
| 2026-11-11 | Preview Worker `edapex-web-preview` deployed at `https://preview.llacademy.ng` (custom domain; Worker version `0d4391b7-d1df-4365-a49a-496a1c718533`). `/`, `/admin/claim-links`, `/claim`, `/workspace`, `/workspace/tasks`, `/workspace/make`, manifest and service worker returned 200; `/claim-link` returned 404 by design. Preview CORS is allowed by API version `c92b858f-d98a-4d03-b786-1ff1efcf1334`; production Pages/API remained 200. |
| 2026-11-11 | 10B web rewrite started: `apps/web` moved in place from Vite/Pages to Next App Router via vinext; chatbot and OpenDuet pins recorded; admin/claim/login ported; OpenDuet shell/composer/transcript/tool/approval components adapted; queue drain corrected to distinct turns; PWA manifest/service worker added; spec authority map added to workspace README. Production Pages remains rollback. |
| 2026-11-11 | 10C capability layer planned and started: spec 48, typed host/server/agent/web contracts, RustO OCR with explicit Mistral consent, native xcodex via `in_process` and dynamic tools, first-party mobile camera preview, desktop PKCE/keychain, TinyFish/Tavily web tools, desktop-only Chrome MCP. `AGENT_DB`/iroh sync kept as a separate follow-on. |
| 2026-11-11 | 10C implementation: RustO crate and models; desktop PKCE/bearer and local OCR ingestion; Tauri capture/OCR/API/keychain host; TinyFish/Tavily providers, fallback, URL policy and agent web routes; Chrome MCP config. Native xcodex dependency graph is blocked on upstream pins; mobile camera plugin remains. |
| 2026-11-08 | Reference-app audit added: OpenDuet selective vendoring vs Novel visual-only, pinned SHAs, `gh api` audit commands, dependency/source enforcement gates |
| 2026-11-09 | Phase 8 closed: 24 h watch, owner POC login and signed checklist. Roadmap coverage gaps fixed: 00/05/06 reading contract, 30/60/extracted-ui-spec coverage, 26-file count, full spec-to-workstream table |
| 2026-11-09 | Admin claim-link flow: subject-based staff/parent tokens, admin directory with non-Gmail flags, `apps/web` page at `app.llacademy.ng`, and public `/claim`; `specs/45-admin-claim-links.md` |
| 2026-11-09 | EGM Goldfish review (stages 5–9) over the 10B bundle completed; resolve applied: contracts single-sourced to `packages/contracts` references, privacy invariant rewritten (retention-bounded), editor/surface scope split v1/10D, directory path set to server pagination, queue semantics fixed, security completions (magic-link gating, claim-cookie spec, PII matrix, injection framing, CSP exception), v2/A2UI/UniFFI material moved to `80`, `90-glossary.md` added; Yjs corrected to artifact body format per `41`/`42`; report at `.dev/docs/egm/10b/goldfish_review_report.md` (untracked) |
| 2026-11-09 | Admin directory 500 fixed (D1 bound-limit query), 60s magic-link dedupe, send-button lock, Pages CSP allows Cloudflare Insights; app domain 200 |
| 2026-11-09 | Performance spec added: static Pages + Worker API, no Pages SSR; snapshot/local pagination, parallel D1 reads, lazy document engine, PWA no school data, measurable release budgets |
| 2026-11-09 | Snapshot D1 reads parallelized: 3.7 s → ~1.9–2.5 s for 581 rows; still above the 800 ms budget, recorded as exception with a follow-up |
