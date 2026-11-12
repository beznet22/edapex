# Workspace Programme Progress

**Status:** Phase 9B approved; 10A deployed; 10B preview live; 10C local capability layer in progress. Phase 8 and the Phase 9A platform are done. `app.llacademy.ng` is live via a proxied Pages CNAME and remains the rollback; the single `apps/web` app is being replaced with a Next App Router PWA built by vinext for a Cloudflare Worker. Migration 0006 and Worker `7bab26b5` are deployed. `/claim` and shared digests move to 10G.2; student codes/duplicate resolution move to 10G.1.

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
