# EdApex Workspace Programme

**Status:** Phase 9B approved; 10A deployed; 10B web rewrite complete on the preview Worker; 10C local capability layer in progress. Phase 8 and the Phase 9A platform are complete. `app.llacademy.ng` is live via a proxied Pages CNAME and remains the production rollback. The replacement `apps/web` is a Next App Router PWA built with vinext for a Cloudflare Worker; it is not a second app. `/claim` and shared password digests are carried to Phase 10G.2 after workspace completion; student codes and duplicate resolution are carried to 10G.1. Phase 10 has started: 9B is approved and 10A is in progress.

This folder is the home for the local-first cowork workspace that follows the EdApex production cutover. It covers the React/Tauri web and desktop clients, the local agent, the shared Rust core, capabilities, GenUI, the document engine, workflows, synchronization and evaluation.

**Start here:** [`ROADMAP.md`](./ROADMAP.md). It contains the agent operating instructions, authority order, workstreams, dependency map, gates and Definition of Done. Do not start implementation from this README alone.

## Relationship to the Cloudflare port

The Cloudflare port and the workspace are two programmes, not two backends.

- **Port authority:** `docs/cloudflare-port/schema-catalog.md`, `05-d1-migration.spec.md`, the port specs and `PROGRESS.md` own the migrated backend, D1/R2, auth and cutover.
- **Workspace authority:** `docs/workspace/specs/*` owns the UI, Tiptap editor, GenUI, document engine, local agent, workflows and v2.
- The port runs **Phases 0–9**. Workspace **Phase 9A is the port's Phase 9 platform closeout**; Phase 10 starts after its deployment, Phase 9B approval and 10A.
- `apps/api/` remains the in-repo EdApex API service. It becomes a pnpm workspace package after Phase 9 and is never extracted into a separate repository.
- `apps/web/` is the single browser application: a React PWA built as a Next App Router app through **vinext** and deployed to a **Cloudflare Worker** with static assets at `app.llacademy.ng`. The previous static Pages deployment is the rollback until the cutover gate.
- `apps/desktop/` is Tauri; its installers are not hosted by the web deployment.
- If a workspace spec and a port spec disagree about backend behaviour, the port spec wins. If they disagree about workspace behaviour, the workspace spec wins. Stop and report a genuine conflict.

## Porting scope

- Only the **62 cataloged legacy tables** may be migrated from MySQL. New tables are allowed only when a port spec owns them; they never import legacy data.
- Workspace tables (`AGENT_DB` and local agent state) are separate from the EdApex school `DB`; no joins, no school data, no session tokens.
- `apps/api/` is UI-less and deployable on its own. Workspace wiring must not break its package, lockfile, tests or deploy dry-run.

## Boundaries

- **EdApex data and user sessions remain authoritative on Cloudflare Workers** (D1/R2 + API). No school-record database is created on a device.
- **Workers Free only.** No Paid fallback. D1 writes are account-wide and capped at 100k/day; checkpoint and resume after 00:00 UTC.
- **Agent work is local-first.** xcodex, Needle 3, workflows, shell and code sandbox execute on the user's device/platform. There is no server-side xcodex.
- **Only agent session/workspace state is synchronized between devices**, via iroh, and never session tokens or school records.
- **School-data PDF/DOCX/CSV renditions** are Worker/R2 or memory only; never local durable or P2P.
- **Cloudflare web target.** `apps/web` is a vinext Worker with static assets. No Pages Functions. The Worker may render the application shell, but authenticated school data is fetched client-side from `api.llacademy.ng`; no school data, session token or private API response is rendered into HTML or cached at the edge. The previous Pages deployment is the rollback until cutover.
- **PWA.** The service worker caches only static assets, the offline shell and icons. It never caches API responses, transcripts, session data or school records.
- **v1** uses Tauri 2 + React + a shared Rust core: Tauri desktop and mobile, plus a browser PWA using the same contracts and Rust/WASM core. The UI covers the route-based surface in `specs/15-ui-surfaces.md`; sequencing is phased, not feature-deferred.
- **v2** is a later native-mobile milestone. React Native, Lynx or Flutter are candidates; none is selected. OpenUI Lang has a React Native entry; Flutter/Lynx do not. Native GenUI parity is a separate gate in `specs/80-v2-native-mobile.md`.

## v1 stack

- React + Next App Router (vinext) + Tailwind v4 + shadcn/ui.
- OpenDuet-derived interaction components + custom xcodex adapter; no assistant-ui, CopilotKit runtime or AI SDK agent.
- OpenUI Lang generated surfaces; no A2UI/MCP Apps in v1.
- Minimal Tiptap inline/side-panel editor; Novel is a visual reference only.
- Document engine: IronPress PDF, PDF.js preview/parse, `docx` Word, Mammoth/Turndown DOCX import, PapaParse CSV.
- Tauri 2 desktop/mobile; vinext Worker + PWA web; Cloudflare Workers API.

## Contract integrity

### API and data contracts

- Backend contracts come from `docs/cloudflare-port`; workspace code consumes the typed `hc<AppType>` client and does not invent request shapes.
- The error envelope is `{ error, message, requestId }`; the 422 `TENANT_SCOPE_REQUIRED` body stays byte-compatible.
- Every query carries `school_id` from the request context; there is no fallback tenant.
- No `any`/`as any`, `never` / `unknown`; explicit return types; types inferred from Zod/Drizzle.
- No SQL or DB access outside repositories; no service-to-service imports.
- Capability grants, approval tokens, idempotency keys and tenant scope are server-issued. UI libraries never mint authority.
- Host capability flags (`nativeAgent`, `localOcr`, `cameraPreview`, `browserAssistance`) are separate from role/server capability flags. A host flag never grants a role operation; a server flag never proves a local tool exists.
- Issued report cards/transcripts are immutable; corrections supersede, never overwrite.
- Archive destruction needs dual control, typed confirmation and audit.

### Workspace contracts

- `packages/contracts` is the single source for workspace API/capability/message-part types; it must not import server runtime code.
- Artifact source versions are immutable; renditions are derived, version-bound and content-hashed.
- `data_class` is enforced: `workspace` local/synced; `edapex` Worker/R2 only; `edapex-ephemeral` memory/download only.
- Markdown is the canonical editable document form; Tiptap is the editor, not the persistence format.
- Imports produce a new document artifact with parser/warning metadata; they never create authoritative marksheets, transcripts, enrollment or fees.
- OpenUI actions are closed IDs (`navigate`, `open_form`, `request_operation`); no arbitrary `{ method, path, body }`.
- GenUI is read-only or assisted; authoritative workflows stay in fixed React.
- Sign-off blocks are visual; real approvals remain server-backed.
- Comments/mentions are staff-only in v1; student references use a permissioned picker, not free-text mentions.
- School-data PDF/DOCX/CSV renditions never enter iroh/Yjs/local durable storage.

## Layering and dependencies

```text
apps/web (vinext Worker + PWA)
  └── packages/contracts, ui, chat, genui, documents, artifacts

apps/desktop (Tauri)
  └── same React packages + Rust crates

apps/api (Workers)
  └── routes → services → repositories → D1/R2
```

- UI packages do not import server runtime code, D1 or Node-only modules.
- Rust crates are platform libraries; web uses their WASM builds.
- `apps/api/` stays a deployable API service; workspace wiring adds it to the root pnpm workspace after Phase 9, with no extraction.
- One construction path for API services; no module-scope singletons or mutable module state.

## Platform rules

### D1 / Workers

- No `db.transaction`; multi-statement writes use `db.batch`.
- Chunked binds: ≤95 ids per `IN`, ≤100 bound parameters per statement.
- Every table ≤100 columns; every query tenant-first.
- ≤10 statements per endpoint; keyset pagination, no `OFFSET`.
- Integer epoch timestamps and ISO date text; never mixed.
- Workers Free only; 100k D1 writes/day account-wide; no Paid fallback.

### Cloudflare web deployment

- `apps/web` builds through vinext and deploys as a Worker with static assets.
- No Pages Functions. The previous Pages deployment remains the rollback until the cutover gate.
- Authenticated pages fetch from `https://api.llacademy.ng`; no school data or session token is embedded in rendered HTML or edge-cached.
- Headers: CSP, HSTS, MIME and cache policy in `next.config.ts`; request/response logging stays off for private data.
- `connect-src` limited to `https://api.llacademy.ng`.
- `worker-src 'self' blob:` for PDF.js; `script-src` must not be weakened to `wasm-unsafe-eval` unless a reviewed WASM feature requires it.
- IronPress/PDF.js/Mammoth/docx are lazy-loaded; no school data in PWA caches.
- Preview Worker per PR; production promotion from the approved release branch, never `main`.

## File and size caps

| Layer/file | Cap |
|---|---|
| Repository file | 300 lines |
| Service file | 400 lines |
| Route module | 300 lines |
| Domain module | ~200 lines |
| Spec document | no cap; inventories generated |
| Workspace UI component | 300-line soft cap; split otherwise |

Document-engine caps from `specs/22-documents-and-artifacts.md`:

- DOCX/PDF upload: **20 MB**
- PDF preview/extraction: **200 pages**
- CSV: **50 MB / 100,000 rows**; preview first **200 rows**
- HTML input to IronPress: **2 MB**
- Worker timeout: **30 s** (Web Worker parse timeout)
- Markdown table conversion: **50 rows / 12 columns**
- DOCX images: per-image and total caps

Bundle caps:

- IronPress WASM (~6.4 MB gzip), PDF.js worker/cmaps, Mammoth and `docx` must be lazy-loaded.
- They must not be in the initial Worker bundle.
- Measure first-export transfer/time on low-end mobile.

## Measured baseline

The backend baseline (tables, rows, indexes, auth counts, hashing cost) is measured and maintained in [`docs/cloudflare-port/README.md`](../cloudflare-port/README.md). Do not duplicate it here; refresh it with `node scripts/introspect-mysql.mjs` when the dump changes.

Workspace performance numbers (Tauri, Worker/PWA, Needle 3, iroh, GenUI, document engine and editor) belong in `specs/70-evaluation-and-rollout.md` and must be device/date-stamped. No invented benchmark numbers.

## Specification authority

Each spec owns one layer. When two specs touch the same behavior, use this map rather than treating every sentence as equal authority.

| Spec | Owns | Does not own |
|---|---|---|
| `00-overview.md` | product and architecture summary | implementation details |
| `05-project-structure.md` | repository layout, app/deployment boundaries | UI behavior |
| `15-ui-surfaces.md` | routes, shell/navigation, responsive/PWA/Tauri presentation, restore/queue/approval/artifact **behavior** | visual token values, GenUI catalog, source-vendoring rules |
| `17-chat-framework.md` | normalized chat events/message parts, xcodex adapter, run/queue state, approval mapping | visual styling or GenUI component catalog |
| `19-design-system.md` | Gold on Slate tokens, typography, accessible primitives, component usage | route layout, chat state, API authority |
| `21-generative-ui-openui.md` | OpenUI v1 catalog/parser/renderer, action bridge, GenUI security/storage | chat shell or platform layout |
| `43-openduet-ui-vendoring.md` | what may be copied/adapted from OpenDuet and how | product behavior or visual identity |
| `44-reference-app-audits.md` | source pins, licenses, audit/enforcement commands | runtime/UI design |
| `47-performance-budgets.md` | load, memory, API and PWA budgets, measurement gates | feature behavior |
| `48-local-capability-layer.md` | host/server capability contracts, Tauri commands and Channel, OCR/camera/web-tool boundaries, capability error taxonomy | role grants, chat projection, AGENT_DB persistence |

Spec 15 controls **where and how a surface appears**. Spec 19 controls **what it looks like and which primitives it uses**. Spec 17 controls **what state it is in**. Spec 21 controls **how generated content is parsed, validated and rendered**. A component that violates 19 is a design-system failure even if 15 places it correctly; a GenUI surface that bypasses 21 is a security failure even if it renders.

## Documents

| File | Purpose |
|---|---|
| [`ROADMAP.md`](./ROADMAP.md) | agent instructions, authority, workstreams, dependency map, gates, Definition of Done |
| [`PROGRESS.md`](./PROGRESS.md) | current status, Phase 8/9A items, decisions, hosting and changelog |
| [`specs/00-overview.md`](./specs/00-overview.md) | product and architecture overview |
| [`specs/05-project-structure.md`](./specs/05-project-structure.md) | monorepo layout, Worker/PWA/Tauri boundary and workspace wiring |
| [`specs/06-legacy-archive.md`](./specs/06-legacy-archive.md) | legacy SvelteKit freeze, tag, archiving and retirement |
| [`specs/10-capabilities-and-roles.md`](./specs/10-capabilities-and-roles.md) | role matrix, capability registry, tool budgets |
| [`specs/15-ui-surfaces.md`](./specs/15-ui-surfaces.md) | web, desktop, Tauri mobile and v2 UI contract |
| [`specs/16-artifacts.md`](./specs/16-artifacts.md) | inline artifact cards, side panel, Tiptap editor and renditions |
| [`specs/17-chat-framework.md`](./specs/17-chat-framework.md) | OpenDuet chat shell, custom xcodex runtime, OpenUI surfaces, Streamdown and Tiptap |
| [`specs/18-operation-inventory.md`](./specs/18-operation-inventory.md) | every current endpoint, missing endpoint, agent tool and phase assignment |
| [`specs/19-design-system.md`](./specs/19-design-system.md) | shadcn/ui + Tailwind v4, Gold tokens and WebView floor |
| [`specs/20-public-applicant-flow.md`](./specs/20-public-applicant-flow.md) | progressive applicant identity, drafts, notifications, enrollment |
| [`specs/21-generative-ui-openui.md`](./specs/21-generative-ui-openui.md) | OpenUI Lang v1 decision, catalog, action bridge, storage and security |
| [`specs/22-documents-and-artifacts.md`](./specs/22-documents-and-artifacts.md) | PDF/DOCX/CSV/Markdown engine, Tiptap editor and artifact renditions |
| [`specs/30-tauri-rust-core.md`](./specs/30-tauri-rust-core.md) | Tauri 2, React, Rust core, web PWA |
| [`specs/40-local-agent-needle-iroh.md`](./specs/40-local-agent-needle-iroh.md) | xcodex, Needle 3, iroh synchronization |
| [`specs/41-storage-sync.md`](./specs/41-storage-sync.md) | local SQLite/OPFS, CRDT/Yjs, D1/R2 cloud sync and EdApex boundary |
| [`specs/42-agent-db-schema.md`](./specs/42-agent-db-schema.md) | OpenDuet-domain AGENT_DB tables, EdApex extensions and sync mapping |
| [`specs/43-openduet-ui-vendoring.md`](./specs/43-openduet-ui-vendoring.md) | selective copy/adapt of OpenDuet components, runtime boundary and MIT attribution |
| [`specs/44-reference-app-audits.md`](./specs/44-reference-app-audits.md) | pinned chatbot/OpenDuet/Novel audits, gh-cli commands and dependency enforcement |
| [`specs/45-admin-claim-links.md`](./specs/45-admin-claim-links.md) | tenant admin directory, per-user claim links, parent/staff provisioning and non-Gmail fallback |
| [`specs/47-performance-budgets.md`](./specs/47-performance-budgets.md) | Worker/PWA hosting, load/memory/API budgets and measurement gates |
| [`specs/48-local-capability-layer.md`](./specs/48-local-capability-layer.md) | local capability contracts, native xcodex, OCR/camera, WebSearch/WebFetch and capability tests |
| [`specs/50-workflows-shell-sandbox.md`](./specs/50-workflows-shell-sandbox.md) | typed workflows, natural-language fallback, shell, sandbox |
| [`specs/60-security-privacy.md`](./specs/60-security-privacy.md) | CF Workers/Pages boundary, PII, approvals, device identity |
| [`specs/70-evaluation-and-rollout.md`](./specs/70-evaluation-and-rollout.md) | Pages/Workers/Tauri benchmarks, GenUI/document/editor evaluation, rollout |
| [`specs/80-v2-native-mobile.md`](./specs/80-v2-native-mobile.md) | RN/Lynx/Flutter v2 options, OpenUI RN correction and GenUI gate |
| [`extracted-ui-spec.md`](./extracted-ui-spec.md) | OpenDuet interaction/UI reference |

Phase 9B is approved; the workspace specs are authoritative for implementation. The port README’s “done” statuses refer to the port spec suite, not these workspace drafts.

## Reading order

1. [`ROADMAP.md`](./ROADMAP.md) §0 — agent instructions and authority.
2. `specs/00-overview.md`, `specs/05-project-structure.md` and this README.
3. `specs/15-ui-surfaces.md`, `16-artifacts.md`, `17-chat-framework.md`, `19-design-system.md`, `21-generative-ui-openui.md`, `22-documents-and-artifacts.md`.
4. `specs/48-local-capability-layer.md`, `specs/06-legacy-archive.md`, `60-security-privacy.md`, `70-evaluation-and-rollout.md`.
5. The remaining specs for the workstream you are implementing.

## Current gates

- **Phase 8 — done:** 24 h watch, owner POC login verification and signed checklist.
- **Phase 9A — done (platform):** migration 0006, Worker, Pages and `app.llacademy.ng` are live; app root/claim/admin 200. `/claim` and digest nulling are deferred to **10G.2**; student codes and duplicate resolution to **10G.1**.
- **Phase 9B — approved:** this documentation set is the implementation baseline.
- **Phase 10 — in progress:** 10A capability contract deployed; 10B preview Worker live; 10C local capability layer in progress. 10G.2 closes after 10F.

## Non-goals for Phase 9B

- No application code, endpoints, migrations or production changes.
- No auth/claim retirement or password cleanup here; those are 10G.2.
- No implementation of the agent, UI, shell, P2P or v2 mobile.
- No claim that Phase 8 is signed off; the 24-hour watch, owner POC login and signed checklist remain open.
- No Paid Workers fallback.
- No server-side xcodex.
- No school data or session tokens in local/P2P storage.
- No assistant-ui, Novel, A2UI or MCP Apps dependency in v1. Novel source is not vendored or copied; see `specs/44-reference-app-audits.md`.
- No standalone extraction of `apps/api/` or a second backend.

## Verification

- Workspace docs: relative-link, code-fence, stale-term and `git diff --check` checks.
- API/port changes: `node scripts/verify-port-specs.mjs` and `node scripts/verify-schema-catalog.mjs`, plus the port tests and deploy dry-run.
- Cloudflare web Worker: verify `next.config.ts` headers, CSP, WASM MIME, cache policy, PWA manifest/service worker and preview/production deploy.
- Update [`PROGRESS.md`](./PROGRESS.md) when work starts and finishes.
- Every number must be measured or cited; no unresolved TBD/TODO.

## Ground rules

- Do not silently exclude a requirement; name it and state why.
- Do not invent schema, endpoints, term dates, permissions or product decisions.
- Stop and report a spec conflict rather than choosing silently.
- Keep diffs inside the workstream; no drive-by refactors.
- One workstream per branch/PR; never push `main`.
- If a gate is not signed, do not start the next workstream.
