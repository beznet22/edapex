# 60 — Security and Privacy

**Draft.** No implementation in Phase 9B.

## Trust boundaries

| Boundary | Authority |
|---|---|
| EdApex data/sessions | Cloudflare Workers only |
| Agent execution | Local device |
| Agent state/workspace | Local encrypted store; optional iroh P2P |
| Tool permissions | Capability registry + CF Worker authorization |
| Mutations | CF Worker validation + audit |
| Approvals | Human decision; server-enforced apply token |

## Non-negotiables

- No local school-record database.
- No session cookies/tokens in P2P sync.
- No provider API keys in web/localStorage or P2P state.
- No server-side xcodex.
- No arbitrary shell as a workflow engine.
- No model-generated code in the main UI runtime.
- No auto-apply of placements, enrollment, email merges or staffing.

## PII

Agent prompts/results may contain student data even if no database is stored. Therefore:

- Minimize data sent to remote models.
- Use local Needle 3 for routing where possible.
- Redact/log-safe tool results.
- Define retention for local transcripts and P2P state.
- Do not sync PII-bearing sessions unless explicitly allowed and encrypted.
- Legal/data-protection review is required before production.

## Prompt injection

Student names, remarks, documents and web content are untrusted. They must not become instructions. Tools are capability-scoped; read/write distinction is server-enforced; high-impact actions require approval.

## Generative UI

See `21-generative-ui-openui.md`. OpenUI Lang is untrusted model output, even when the model is local.

- Parse and validate against the host catalog; enforce component/prop schemas and size limits.
- Reject unsupported components, expressions, `query`/`mutation` primitives and over-budget surfaces.
- No raw HTML/CSS/JS, iframe, third-party origin, dynamic import, `eval` or model-supplied `window.open` URL.
- Render only registered React components mapped to Gold on Slate.
- Actions are closed IDs (`navigate`, `open_form`, `request_operation`); no arbitrary method/path/body.
- `request_operation` is server-authorized for role, tenant, record state and approval policy.
- GenUI never approves, never writes directly and never mints a capability or approval token.
- `edapex-ephemeral` surfaces store source/catalog version/expiry only; no school-data snapshot in local storage or sync.
- Surface expiry, parser failure and unknown components fall back to a fixed tool card or text, never a blank or stale screen.
- A2UI, CopilotKit A2UI and MCP Apps/iframe GenUI are not v1 renderers.

## Document imports and exports

See `22-documents-and-artifacts.md`. Imported PDFs, DOCX and CSV are untrusted.

- Parse in Web Workers with size/time/page/row caps.
- Mammoth: `externalFileAccess: false`; sanitize its HTML before preview or Markdown conversion.
- PDF.js: no remote fetch; cap pages/size; no OCR in v1.
- IronPress: sanitize HTML; browser WASM gets data-URL images and font bytes only; no local paths or remote fetch.
- Reject macros, encrypted documents, scripts, iframes and `javascript:` links.
- CSV export neutralizes formula-leading cells.
- Comments/mentions are staff-only in v1; student references use a permissioned picker, never free-text mention.
- Sign-off blocks are visual; approval tokens remain server-issued.
- School-data renditions are Worker/R2 or memory only; exports are audited.
- No PDF/A, tagged-PDF or OCR promise in v1.

## Cloudflare Pages boundary

`apps/web` is static hosting only; it is not an API and must not contain secrets.

- `_headers` enforces CSP, HSTS, content-type and cache policy.
- `connect-src` is limited to the EdApex Worker origin.
- WASM/worker assets are lazy-loaded and served with `application/wasm`/JS MIME.
- The PWA service worker caches the app shell/static assets only; never school data or API responses.
- No Pages Functions, SSR, session validation or D1/R2 access.
- Tauri installers/updaters are not hosted on Pages.

## Device and P2P

- Device keys; pairing; Worker-issued authorization.
- Revocation removes peer access and wipes local state where required.
- E2EE; relay metadata is still visible.
- Lost-device policy, backup and recovery must be defined.
- No central audit for local agent state; API mutation audit remains server-side.

## Admin issue resolution

The agent may list, inspect and propose. Apply requires:

- a human-approved plan
- expected version/optimistic concurrency
- idempotency key
- server-side role/tenant checks
- audit record

The 237/15/24/5/1 items are policy decisions, not auto-fixable errors.
