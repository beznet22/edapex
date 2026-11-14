# Workspace Programme Roadmap

**Status:** Phase 9B **approved**; 10B web rewrite in progress. Phase 8 and the Phase 9A platform are **done**. `app.llacademy.ng` is live via a proxied Pages CNAME and remains the rollback. The single `apps/web` app is being replaced with a Next App Router PWA built by vinext and deployed as a Cloudflare Worker with static assets. Migration 0006 and Worker `7bab26b5` are deployed. The transitional `/claim` route and shared password digests are explicitly carried into **10G.2** after cowork workspace completion. Student codes, duplicate-email resolution and staff/parent provisioning are carried into **10G.1**. The former 2026-12-03 `/claim` removal date is withdrawn.

## 0. Agent operating instructions — read first

You are implementing the EdApex local-first workspace. Read this roadmap, `PROGRESS.md`, `specs/00-overview.md`, `specs/05-project-structure.md`, and the workstream's “Read first” list before changing code. Read `specs/06-legacy-archive.md` before legacy retirement or rollout. Do not start a workstream until its dependency gate is signed.

### Authority order

1. `docs/cloudflare-port/schema-catalog.md` and `05-d1-migration.spec.md` — the migrated backend and data movement.
2. `docs/cloudflare-port/01/02/03/04/04a/06` — backend structure, auth, HTTP and archive behaviour.
3. `docs/workspace/specs/*` — workspace UI, Tiptap editor, GenUI, document engine, local agent, workflows and v2. Within that set, use the authority map in `docs/workspace/README.md#specification-authority`: 15 owns surface behavior/placement, 17 owns chat state, 19 owns visual primitives, 21 owns GenUI, 43/44 own source reuse, 47 owns budgets and 05 owns repository/deployment boundaries.
4. This roadmap is sequencing only; it never overrides a spec.
5. `PROGRESS.md` is live status, not a design document.

If two specs conflict, stop and report. Do not pick one silently.

### Non-negotiables

- EdApex data and user sessions live only on Cloudflare Workers/D1/R2.
- **Workers Free only.** No Paid fallback. D1 writes are account-wide and capped at 100k/day; checkpoint and resume after 00:00 UTC.
- No school data, session tokens or school-data PDF/DOCX/CSV renditions in local/P2P storage or iroh.
- No server-side xcodex. xcodex, Needle 3, workflows, shell and sandbox run locally.
- Tiptap is the editor. Novel is a visual reference only: no package, no source copy, no AI SDK. Enforce `specs/44-reference-app-audits.md`.
- OpenUI Lang is v1 GenUI. No assistant-ui, CopilotKit runtime, A2UI or MCP Apps in v1.
- PDF: IronPress. Preview/parse: PDF.js. DOCX: `docx` + Mammoth/Turndown. CSV: PapaParse.
- No `any`, no `as any`, no `db.transaction`; tenant-scope every query; respect repository/service/route/domain line caps.
- No invented schema, endpoints, term dates or product decisions.
- No drive-by refactors. One workstream per branch/PR. Never push `main`.

### Required verification

- API changes: typecheck, tests, `node scripts/verify-port-specs.mjs`, `node scripts/verify-schema-catalog.mjs`, deploy dry-run.
- Workspace docs: relative-link, code-fence and stale-term checks.
- Report: what changed · files · tests run · gate output · deviations · open questions.
- Update `docs/workspace/PROGRESS.md` at start and finish.

## 1. Authority and relationship to the Cloudflare port

The Cloudflare port and the workspace are two programmes, not two backends.

- `docs/cloudflare-port/schema-catalog.md`, `05-d1-migration.spec.md`, the port specs and `PROGRESS.md` are authoritative for the migrated backend, D1/R2, auth and cutover.
- `docs/workspace/specs/*` are authoritative for the workspace UI, editor, GenUI, local agent, workflows and v2.
- The port phases run **0 → 9**. Workspace **Phase 9A is the port's Phase 9** (auth/retention closeout). Workspace **Phase 10** starts only after that gate.
- `services/sms-api/` remains the in-repo EdApex API service. It becomes a pnpm workspace package after Phase 9; it is not extracted into a separate repository.
- `apps/web/` is the single browser PWA: a Next App Router app built by **vinext** and deployed as a **Cloudflare Worker with static assets** at `app.llacademy.ng`. `services/sms-api/` is the Hono API on **Cloudflare Workers**. `apps/desktop/` is Tauri; its installers are not hosted by the web deployment. The previous Pages deployment is rollback only.
- If a workspace spec and a port spec disagree about backend behaviour, the port spec wins and the workspace spec is corrected. If they disagree about workspace behaviour, the workspace spec wins. Stop and report a genuine conflict; do not pick silently.

## 2. Goal

Build a local-first cowork workspace for EdApex across web, desktop and mobile, while keeping EdApex data and user sessions authoritative on Cloudflare Workers.

The workspace is a general office-agent harness. EdApex is a capability/tool pack inside it, not the only domain the UI understands.

## 3. Current state

| Gate | State | Evidence |
|---|---|---|
| Phase 8 — cutover | **done** | 24 h watch closed 2026-11-09; owner POC login confirmed; checklist signed; 2,298 EdApex requests/0 errors, D1 96 write queries/180 rows, FK 0. See `docs/cloudflare-port/PROGRESS.md`. |
| Phase 9A — auth/retention + workspace wiring | **in progress** | Admin claim-link backend and first `apps/web` page are being added. Shared `/claim` remains until staff/parent coverage and student codes pass. |
| Phase 9B — workspace handoff docs | **draft** | 26 markdown files under `docs/workspace/`; awaiting approval. |
| Phase 10 — workspace implementation | **blocked** | Requires Phase 8 gate, Phase 9A gate, Phase 9B approval and workspace wiring. |

## 4. v1 architecture

```text
React UI
  ├── Web PWA: Next App Router via vinext, Cloudflare Worker + static assets (app.llacademy.ng)
  └── Tauri 2 desktop + mobile (system WebView)
        │
        ├── OpenDuet-derived chat shell + xcodex adapter
        ├── OpenUI Lang generated surfaces
        ├── minimal Tiptap document editor
        └── document engine (IronPress/PDF.js/docx/PapaParse)
        │
        ▼
Shared Rust core
  ├── xcodex local agent
  ├── Needle 3 local router
  ├── capability registry + approvals
  ├── typed workflow IR + sandbox
  ├── workspace + allowlisted shell
  └── iroh state/workspace sync
        │
        ▼
Cloudflare Workers (api.llacademy.ng)
  ├── auth + user sessions (only authority)
  ├── D1/R2 EdApex data (only authority)
  └── API mutation authorization + audit
```

### v1 boundaries

- xcodex runs **locally**; there is no server-side xcodex.
- Tauri 2 covers desktop and mobile using the system WebView; React Native is deferred to v2.
- Web uses a PWA and the same React contracts; Rust core is compiled to WASM.
- v1 UI covers the route-based OpenDuet surface in `specs/15-ui-surfaces.md`.
- EdApex data and session records never live on the device as a system of record.
- iroh synchronizes only agent session/workspace state between a user's devices.
- School-data PDF/DOCX/CSV renditions are Worker/R2 or memory only; never P2P/local durable.
- Agent API writes pass through CF Worker authorization and audit.
- **Workers Free only.** No Paid fallback. D1 writes are account-wide and capped at 100k/day.
- `services/sms-api/` remains deployable on its own; workspace wiring must not break its package, lockfile, tests or deploy dry-run.

### Cloudflare web boundary

- `apps/web` builds through vinext and deploys as a Worker with static assets; no Pages Functions and no second API.
- `app.llacademy.ng` → web Worker; `api.llacademy.ng` → API Worker. The previous Pages deployment is the rollback until cutover.
- Build: `pnpm install --frozen-lockfile && pnpm --dir apps/web build`; output `apps/web/dist`. Deploy with `vinext-cloudflare` using `apps/web/cloudflare.config.ts` and `apps/web/worker/index.ts`.
- Headers: CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, cache policy in `next.config.ts`.
- CSP: `connect-src https://api.llacademy.ng`; `worker-src 'self' blob:`; `img-src 'self' data: blob:`; no arbitrary frames. Do not add `wasm-unsafe-eval` unless a reviewed WASM feature requires it.
- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` only if OPFS SQLite or WASM threads require them; test first.
- IronPress WASM (6.4 MB gzip) and PDF.js worker/cmaps are lazy-loaded, never in the initial bundle.
- PWA service worker caches static assets, icons and the offline shell only; never API responses, transcripts, session data or school records.
- Preview Worker per PR; production promotion from the approved release branch, never `main`.
- Tauri installers/updaters use GitHub Releases or R2, not the web Worker.

## 5. Workstreams

Each workstream lists its dependencies, required reading and acceptance. Implementation is sequenced, not feature-deferred.

### Spec coverage

Every spec maps to at least one workstream; `06` and the cross-cutting specs are required reading even when their implementation lands in a later slice.

| Spec | Primary workstream |
|---|---|
| `00-overview.md` | all workstreams |
| `05-project-structure.md` | all workstreams; 10B owns package wiring |
| `06-legacy-archive.md` | 10B; 10F rollout/retirement |
| `10-capabilities-and-roles.md` | 10A, 10E |
| `15-ui-surfaces.md` | 10B |
| `16-artifacts.md` | 10B |
| `17-chat-framework.md` | 10B |
| `18-operation-inventory.md` | 10A, 10E |
| `19-design-system.md` | 10B |
| `20-public-applicant-flow.md` | 10A, 10E |
| `21-generative-ui-openui.md` | 10B, 10F |
| `22-documents-and-artifacts.md` | 10B, 10F |
| `30-tauri-rust-core.md` | 10B, 10C, 10F |
| `40-local-agent-needle-iroh.md` | 10C |
| `41-storage-sync.md` | 10C |
| `42-agent-db-schema.md` | 10C |
| `43-openduet-ui-vendoring.md` | 10B |
| `44-reference-app-audits.md` | 10B |
| `45-admin-claim-links.md` | 10B, 10E |
| `47-performance-budgets.md` | 10B, 10F |
| `45-admin-claim-links.md` | 10B, 10E |
| `50-workflows-shell-sandbox.md` | 10D |
| `60-security-privacy.md` | 10A–10F |
| `70-evaluation-and-rollout.md` | 10D, 10F |
| `80-v2-native-mobile.md` | v2 §10 |

`extracted-ui-spec.md` is the OpenDuet interaction reference for 10B.

### 10A — Capability contract, admin issues and public contract

- role/capability registry
- public applicant flow contract
- admin issue read model + plan/apply contract
- tool-pack budgets (max 5 tools, max 8 operations/tool)
- typed API/capability contracts consumed by the workspace
- no speculative endpoints

**Read first:** `specs/00-overview.md`, `specs/05-project-structure.md`, `specs/10-capabilities-and-roles.md`, `specs/18-operation-inventory.md`, `specs/20-public-applicant-flow.md`, `specs/45-admin-claim-links.md`, `specs/60-security-privacy.md`.

**Depends on:** Phase 9A + Phase 9B approval.

**Accept:** capability manifest; admin issue list/detail/plan/apply; public applicant contract; no tool pack over budget; no endpoint without a phase/owner.

### 10B — Tauri shell, GenUI, editor and document engine

- React shell based on OpenDuet interaction/state; Gold on Slate
- Tauri desktop **and** mobile WebView; web PWA on a vinext Worker
- full v1 surface matrix from `specs/15-ui-surfaces.md`
- OpenUI Lang generated surfaces; read-only/assisted only
- minimal Tiptap inline/side-panel editor (same editor, not a full toolbar)
- document engine: IronPress PDF, PDF.js preview/parse, `docx` Word, Mammoth/Turndown DOCX import, PapaParse CSV
- artifact renditions/imports/comments/sign-offs/checklists
- legacy EdApex UI reuse: report/transcript templates, filestore/artifact viewer patterns, school settings
- legacy SvelteKit freeze/tag/retirement sequence
- workspace package wiring: `services/sms-api/` joins the pnpm workspace, stays deployable, no extraction
- Worker route/custom domain, `next.config.ts` headers, preview/production deploy

**Read first:** `specs/00-overview.md`, `specs/05-project-structure.md`, `specs/06-legacy-archive.md`, `specs/15-ui-surfaces.md`, `16-artifacts.md`, `17-chat-framework.md`, `19-design-system.md`, `21-generative-ui-openui.md`, `22-documents-and-artifacts.md`, `30-tauri-rust-core.md`, `43-openduet-ui-vendoring.md`, `44-reference-app-audits.md`, `45-admin-claim-links.md`, `47-performance-budgets.md`, `60-security-privacy.md`, and `extracted-ui-spec.md`.

**Depends on:** 10A; Phase 9A workspace wiring.

**Accept:** shell + chat + editor + documents run on web Pages, Tauri desktop and Tauri mobile; v1 surface matrix implemented; no assistant-ui/Novel/A2UI runtime; no persistent formatting toolbar; downloads and renditions work; no school-data local/P2P renditions; legacy freeze/tag/read-only/exclude/archive/retire sequence follows `06`; no `60` boundary violation.

### 10C — Local agent, Needle 3 and iroh

- xcodex local host adapter
- Needle 3 native on Tauri; WASM on web
- iroh device identity and encrypted session/workspace sync
- no school data in P2P state
- sync allowlist/redaction

**Read first:** `specs/00-overview.md`, `specs/05-project-structure.md`, `specs/30-tauri-rust-core.md`, `specs/40-local-agent-needle-iroh.md`, `specs/41-storage-sync.md`, `specs/42-agent-db-schema.md`, `specs/60-security-privacy.md`.

**Depends on:** 10B.

**Accept:** xcodex adapter; Needle benchmark; iroh pair/sync/revoke; no school data/token leak.

### 10D — Workflows, shell and sandbox

- TypeScript workflow IR authoring/validation
- agent-composed plans and natural-language fallback
- sandboxed code steps for work not expressible as typed workflows
- allowlisted shell for filesystem work
- approval gates and audit

**Read first:** `specs/00-overview.md`, `specs/05-project-structure.md`, `specs/50-workflows-shell-sandbox.md`, `specs/60-security-privacy.md`, `specs/70-evaluation-and-rollout.md`.

**Depends on:** 10B.

**Accept:** IR validation/rejection; sandbox escape tests; shell cannot call school APIs; approvals/idempotency.

### 10E — Public onboarding and admin resolution

- progressive applicant identity, drafts, notifications
- admission review, enrollment, staff registration
- admin issue plan/apply with human approval
- all-role tool packs with parent/student read-only writes policy

**Read first:** `specs/00-overview.md`, `specs/05-project-structure.md`, `specs/10-capabilities-and-roles.md`, `specs/18-operation-inventory.md`, `specs/20-public-applicant-flow.md`, `specs/60-security-privacy.md`.

**Depends on:** 10A; 10B for surfaces.

**Accept:** no self-created active accounts; admin plan/apply; parent/student read-only; audit on every step; `60` approval, PII and redaction rules hold.

### 10F — Evaluation and rollout

- Needle 3 tool accuracy/memory benchmarks
- Tauri desktop/mobile/WebView performance
- vinext Worker performance, cache and PWA offline shell
- iroh pairing/conflict/revocation
- GenUI/OpenUI evaluation
- document engine evaluation (IronPress/PDF.js/DOCX/CSV)
- editor/minimal Tiptap evaluation (slash/bubble/AI proposal/mobile)
- security/privacy review
- staged rollout and rollback

**Read first:** `specs/00-overview.md`, `specs/05-project-structure.md`, `specs/06-legacy-archive.md`, `specs/30-tauri-rust-core.md`, `specs/47-performance-budgets.md`, `specs/70-evaluation-and-rollout.md`, `specs/60-security-privacy.md`, `specs/21-generative-ui-openui.md`, `specs/22-documents-and-artifacts.md`.

**Depends on:** 10B–10E.

**Accept:** benchmark evidence, no unresolved high-severity security finding, rollback exercised, web Worker deploy verified.

### 10G — Identity operations and transitional auth retirement

This is the carried-forward home for the operational tail. It must not reopen Phase 9A.

#### 10G.1 — Identity provisioning (starts with 10B)

- Admin claim-link rollout for staff and parents.
- Student code issuance and distribution for the full student population.
- Duplicate-email resolution or explicit flagging.
- Staff/parent claiming and Google linking, including non-Gmail assistance.
- Admin directory coverage reporting.

**Read first:** `specs/45-admin-claim-links.md`, `specs/10-capabilities-and-roles.md`, `specs/20-public-applicant-flow.md`, `specs/60-security-privacy.md`.

**Depends on:** 10A/10B for the directory and claim-link surface.

**Accept:** every student has a code; every duplicate is resolved or flagged; staff/parent coverage is measured; non-Gmail accounts are visible and assisted.

#### 10G.2 — Transitional retirement (after 10F)

- Remove `/claim` and the claim reset/admin surface.
- Null remaining password digests, then drop the column in a later migration.
- Execute the retention sweep.
- Record archive purge/retention decisions.

**Read first:** `specs/45-admin-claim-links.md`, `04a-auth-cutover.spec.md`, `06-archive-and-retrieval.spec.md`, `specs/60-security-privacy.md`.

**Depends on:** 10F and a completed 10G.1 population gate.

**Accept:** `/claim` is 404; password digests are zero; retention counts match the dry-run; no transitional auth path remains.

## 6. Phase 10 dependency map

```text
Phase 8 gate
  → Phase 9A (port Phase 9: auth/retention + workspace wiring)
  → Phase 9B docs approval
  → 10A capability contract
  → 10B shell + GenUI + editor + documents
      ├── 10C local agent/Needle/iroh
      ├── 10D workflows/shell/sandbox
      ├── 10E public onboarding/admin resolution
      └── 10G.1 identity provisioning
              ↓
            10F evaluation/rollout
              ↓
            10G.2 transitional retirement
```

10C and 10D can run in parallel once 10B exposes the shell contracts. 10E needs 10A and the relevant 10B surfaces. 10G.1 starts with the admin claim-link surface and continues through 10E. 10F is last before 10G.2.

## 7. Gates

### Phase 8 (done)

- 24-hour watch from 2026-11-08T02:26Z reviewed
- owner POC portal login verified
- production rollback drill complete (already recorded)
- Phase 8 checklist signed

Do not restate cutover details here; use `docs/cloudflare-port/PROGRESS.md` and `cutover/checklist.md`.

### Phase 9A — port Phase 9 + workspace wiring (platform)

- migration 0006 applied; Worker deployed; `apps/web` deployed to `edapex-web.pages.dev`
- magic link and admin claim-link smoke pass; `app.llacademy.ng` proxied CNAME and 200
- retention sweep dry-run matches expectations
- session archives 1–4 manifests verified
- workspace package wiring verified: `services/sms-api/` joins the pnpm workspace, remains deployable, and the port verifiers + deploy dry-run still pass
- `services/sms-api/` remains the in-repo API service; no standalone extraction
- **transitional exception:** `/claim` and shared password digests remain until 10G.2; student codes, duplicate resolution and staff/parent coverage belong to 10G.1

### Phase 9B — this documentation gate (draft)

- `docs/workspace/README.md`, `ROADMAP.md`, `PROGRESS.md` and all specs present
- v1/v2 decisions recorded, including OpenUI, Tiptap, document engine, legacy UI reuse, vinext Worker/PWA and OpenUI React Native
- no unresolved TBD/TODO
- relative links, code fences and stale-term checks pass
- no code/endpoints/production changes in Phase 9B

### Phase 10 — implementation (blocked)

- Phase 8 signed
- Phase 9A platform deployed
- Phase 9B approved
- 10A capability contract implemented and reviewed
- explicit owner approval to start
- 10G.2 excluded from this gate and closes after 10F

## 8. Working agreement

1. One phase/workstream per branch and pull request; do not start before the dependency gate passes.
2. Update `docs/workspace/PROGRESS.md` at start and finish; a phase is not done until it reflects the gate.
3. Read the workstream's “Read first” list before changing code.
4. Stop and ask if a spec is ambiguous; do not invent schema, endpoints or product decisions.
5. Keep diffs inside the workstream; no drive-by refactors.
6. For API changes, run `node scripts/verify-port-specs.mjs` and `node scripts/verify-schema-catalog.mjs`, plus the port tests and deploy dry-run.
7. For workspace docs, run the link/fence/stale-term checks in `PROGRESS.md`.
8. Report: what changed · files · tests run · gate output · deviations · open questions.

## 9. Definition of done

- Typecheck, lint and tests pass.
- No `any`/`as any`, no `db.transaction`, no direct DB access outside repositories.
- Tenant scoping and capability/approval rules hold.
- File caps: repository 300, service 400, route 300, domain ~200.
- Port verifiers pass for API changes; workspace docs checks pass for docs.
- `PROGRESS.md` updated.
- PR description contains gate output and the report format above.
- No school data or session tokens in local/P2P storage.
- Web Worker deploy verified with `next.config.ts` headers and the Worker API origin.

## 10. v2 native mobile

v2 is a later milestone; no runtime is selected. It replaces the Tauri mobile WebView UI with a native client while preserving CF Workers authority, the shared Rust core, local xcodex/Needle/iroh, workflows, shell and sandbox.

Candidates and scope: `specs/80-v2-native-mobile.md`.

- React Native
- Lynx/ReactLynx
- Flutter

OpenUI Lang has a React Native native entry; Flutter/Lynx have no OpenUI renderer and need a custom renderer, A2UI or WebView. GenUI parity is a v2 gate. Only one runtime should be pursued; v2 must not fork the backend, auth model or capability semantics.

## 11. Non-goals

- Replicate EdApex data locally
- Sync user sessions, API tokens or school-data renditions over P2P
- Server-side xcodex
- Paid Workers fallback
- Build all endpoints before v1 is validated
- One tool per API route in Needle
- Treat shell as a workflow engine
- Start React Native/Lynx/Flutter before the v2 gate
- Fork the backend or extract `services/sms-api/` into a separate repository
- Make Novel a dependency, copy Novel source, or turn the minimal Tiptap editor into a full toolbar-rich editor
- Treat PDF/DOCX/CSV parsing as authoritative school-record creation
- Promise OCR, PDF/A or tagged PDF in v1
- Host `services/sms-api` or Tauri installers on the web Worker/Pages
