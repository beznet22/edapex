# Workspace Programme Progress

**Status:** Phase 9B approved; 10A in progress. Phase 8 and the Phase 9A platform are done. `app.llacademy.ng` is live via a proxied Pages CNAME; migration 0006 and Worker `7bab26b5` are deployed. `/claim` and shared digests move to 10G.2; student codes/duplicate resolution move to 10G.1.

## Status table

| Workstream | Status | Notes |
|---|---|---|
| Phase 8 — cutover | **done** | 24-hour watch closed 2026-11-09; owner POC login confirmed; checklist signed; 2,298 EdApex requests/0 errors |
| Phase 9A — auth/retention | **done (platform)** | Migration 0006, Worker `bfa72530`, Pages `edapex-web.pages.dev`, proxied CNAME `app.llacademy.ng` → `edapex-web.pages.dev`; app root/claim/admin 200; `/claim` 202; magic 202; admin 401. Transitional `/claim` and digests are 10G.2 |
| Phase 9B — handoff docs | **approved 2026-11-09** | 28 markdown files; documentation only |
| Phase 10A — capability contract | **deployed** | Worker `372cb73f`; shared `@edapex/contracts`, role manifest, budget checks, admin issue read/plan/apply, public applicant contract |
| Phase 10B — workspace shell | **in progress** | `/workspace` deployed; 430px shell, capability gate, expanded runtime/turn contract, truthful offline preview (mock conversation removed), tool activity, approval/surface components; post-login redirect targets the workspace. Shared `@edapex/chat` queue/turn reducer with 15 tests and MIT-vendored OpenDuet Message/Skeleton primitives landed; queue count/stop wiring and the runtime-adapter contract landed; restore/following wiring, editor, OpenUI and Tauri slices remain |
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
| Local-first v1 | Tauri 2 desktop/mobile + React + shared Rust core; web PWA |
| v1 UI scope | v1 OpenDuet surface defined in `specs/15-ui-surfaces.md`; implementation is sequenced, not feature-deferred |
| Agent locality | xcodex and Needle 3 run locally; no server-side xcodex |
| Data/session authority | CF Workers only; no local school-record DB or session authority |
| Sync | iroh for encrypted agent session/workspace state only |
| Workflows | TypeScript workflow IR; Rust execution; code sandbox fallback; shell separate |
| Tool budget | Max 5 tools per role/turn; max 8 operations per tool |
| Public onboarding | Public applications; no self-created active accounts; progressive applicant identity |
| Roles | All roles in v1; parent/student read-only, admin/teacher writes with approval |
| OmniRoute | Self-hosted behind the EdApex gateway; provider allowlist, no PII fallback |
| v2 mobile | React Native, Lynx or Flutter; deferred and not selected |
| Chat framework | OpenDuet vendored shell + custom xcodex runtime; no assistant-ui, CopilotKit runtime or AI SDK agent |
| GenUI | OpenUI Lang in v1; read-only or assisted, never authoritative; A2UI deferred to a v2/remote-agent gate |
| Chat Markdown | Streamdown for chat and artifact preview; Tiptap for editable artifacts |
| GenUI storage | Typed `message_parts`; `edapex-ephemeral` surfaces store source/catalog version/expiry, never a PII snapshot |
| Document engine | IronPress PDF (Rust native / lazy WASM), PDF.js preview+parse, `docx` Word, Mammoth/Turndown DOCX import, PapaParse CSV |
| Artifact editor | Minimal Tiptap inline/side-panel; Novel is visual reference only — no package/source/AI SDK; double-diagonal-arrow opens side panel |
| Reference audits | OpenDuet pin `f52288f…` selective vendoring; Novel pin `fa95098…` visual-only; `gh api` commands and dependency/source gates in `specs/44-reference-app-audits.md` |
| Admin claim links | Tenant staff/parent directory at `app.llacademy.ng/admin/claim-links`; per-user 72h tokens; staff/parent provisioning; non-Gmail badge; `specs/45-admin-claim-links.md` |
| Artifact renditions | Version-bound PDF/DOCX/CSV/HTML/PNG; `workspace` local, `edapex` Worker/R2, `edapex-ephemeral` memory only |
| Hosting | Web PWA on Cloudflare Pages (`app.llacademy.ng`); API on Cloudflare Workers (`api.llacademy.ng`); Tauri installers on GitHub Releases/R2 |

## Open questions

- Is Tauri 2 mobile WebView performance acceptable on low-end Android and iOS?
- Can xcodex’s Rust core be hosted natively by Tauri on mobile, or is local WASM WebView the fallback?
- Which Needle 3 subnetwork meets accuracy/memory targets on school devices?
- What is the exact scope of “agent state” allowed to sync over iroh, and how is PII redacted?
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
| 2026-11-08 | Reference-app audit added: OpenDuet selective vendoring vs Novel visual-only, pinned SHAs, `gh api` audit commands, dependency/source enforcement gates |
| 2026-11-09 | Phase 8 closed: 24 h watch, owner POC login and signed checklist. Roadmap coverage gaps fixed: 00/05/06 reading contract, 30/60/extracted-ui-spec coverage, 26-file count, full spec-to-workstream table |
| 2026-11-09 | Admin claim-link flow: subject-based staff/parent tokens, admin directory with non-Gmail flags, `apps/web` page at `app.llacademy.ng`, and public `/claim`; `specs/45-admin-claim-links.md` |
| 2026-11-09 | Admin directory 500 fixed (D1 bound-limit query), 60s magic-link dedupe, send-button lock, Pages CSP allows Cloudflare Insights; app domain 200 |
| 2026-11-09 | Performance spec added: static Pages + Worker API, no Pages SSR; snapshot/local pagination, parallel D1 reads, lazy document engine, PWA no school data, measurable release budgets |
| 2026-11-09 | Snapshot D1 reads parallelized: 3.7 s → ~1.9–2.5 s for 581 rows; still above the 800 ms budget, recorded as exception with a follow-up |
