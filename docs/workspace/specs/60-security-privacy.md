# 60 — Security and Privacy

**Draft.** No implementation in Phase 9B.

## Trust boundaries

| Boundary | Authority |
|---|---|
| EdApex data/sessions | Cloudflare Workers only |
| Agent execution | Local device |
| Agent state/workspace | Local encrypted store; iroh-first transport, Cloudflare `AGENT_DB` authority |
| Tool permissions | Capability registry + CF Worker authorization |
| Mutations | CF Worker validation + audit |
| Approvals | Human decision; server-enforced apply token |

## Non-negotiables

- No local school-record database.
- No session cookies/tokens in P2P sync.
- No provider API keys in web/localStorage or P2P state.
- No server-side agent runtime. The agent executes on the user's device; the server owns policy, connectors and persistence.
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
- PDF.js: no remote fetch; cap pages/size; no OCR inside the PDF renderer. Marksheet OCR is a separate RustO/Mistral path (`48`).
- IronPress: sanitize HTML; browser WASM gets data-URL images and font bytes only; no local paths or remote fetch.
- Reject macros, encrypted documents, scripts, iframes and `javascript:` links.
- CSV export neutralizes formula-leading cells.
- Comments/mentions are staff-only in v1; student references use a permissioned picker, never free-text mention.
- Sign-off blocks are visual; approval tokens remain server-issued.
- School-data renditions are Worker/R2 or memory only; exports are audited.
- No PDF/A or tagged-PDF promise in v1.

## Local OCR and camera

- RustO is the default; Mistral OCR is explicit fallback only.
- The local OCR request to the API carries text/annotation, never the image.
- The cloud OCR route requires `X-OCR-Consent: cloud`; no silent upload path exists.
- Camera captures go to app cache only; EXIF orientation is applied, GPS/location metadata is stripped and the file is deleted on release/TTL.
- No photo-library write. No desktop/PWA camera preview. The native camera session stops on background/cancel/close.
- Chrome DevTools MCP is desktop-only and user-installed; PWA/mobile have no browser control. No custom extension or BrowserBridge exists.

## Connectors and governed MCP

Connectors run **server-side** in `services/cowork-api`. They are the only way an agent reaches a third-party system, and they are not part of the agent runtime.

- **Governed MCP client.** The Worker is an MCP *client*; it dials out to a configured server. It never spawns a process and never accepts a server supplied by model output at runtime.
- **Per-agent grants.** A connector tool is usable only when granted through `plugin_grants` and the agent's `AgentGrant`. Grants are validated at call time, not at connect time.
- **Per-person OAuth.** Google Workspace connects per user; tokens are encrypted at rest, write-only, never returned by an API and redacted from audit events. There is no deployment-wide shared mailbox token.
- **Read vs write.** A tool that cannot be positively classified as a read is a write and goes through policy → audit → act. Outgoing messages always require an explicit decision showing recipient and content.
- **No brokered/paid connectors.** Composio/Arcade-style brokers stay out of v1. A self-run MCP client is in scope; a paid broker is not.
- **Zero app bytes.** Connector code, credentials and catalogue never enter the web bundle, the Tauri binary or the APK.
- **Tool results are data.** Connector output is never treated as instructions; the same prompt-injection framing as web content applies.

This does not relax the browser boundary: a connector is server-side reach, not browser control. PWA/mobile still cannot drive a browser.

## WebSearch and WebFetch

- Web tool provider keys (TinyFish, Tavily) are `services/sms-api` Worker secrets; they never reach the WebView, keychain or bundle.
- Search queries and fetched URLs are not written to logs; only provider, status and byte counts are logged.
- Fetch URLs are validated server-side: HTTP(S) only, no localhost/private/link-local/metadata hosts.
- Search is staff-only in v1; quotas are tenant-scoped and reuse `auth_rate_limits`.
- Search results and fetched content are untrusted data and must be framed as data in prompts, never instructions.

## Model provider credentials

Language-model credentials are held **only** by `services/model-router`. They never reach a client bundle, a WebView, a keychain, `sms-api` or `cowork-api`.

- Keys are stored in **Cloudflare AI Gateway via BYOK** (Secrets Store), not as Worker secrets, and are selected per tenant with `cf-aig-byok-alias`. Rotating a key is a dashboard action with no redeploy.
- `services/model-router` holds only `CF_AIG_TOKEN` (authorises the gateway call) and `CALLER_SECRET` (proves the caller is an EdApex Worker). Neither is a provider credential.
- **Prompt and response logging is disabled on every request** with `cf-aig-collect-log: false`. AI Gateway logs both bodies by default, and prompts contain marksheet OCR text and parent conversations.
- Because that header is the guarantee, **no client may call AI Gateway directly.** The browser, desktop and mobile reach models only through `model-router`. A browser could omit the header; a server cannot be made to.
- Requests use direct provider passthrough, never the Unified Billing surface, where a missing BYOK key silently falls through to Cloudflare billing and charges the wrong party.
- `model-router` has no public hostname (`workers_dev: false`, no `routes`). It does not parse cookies and does not bind D1, so it cannot be induced to authenticate a caller.

## Desktop authentication

- Tauri uses signed PKCE code exchange with the system browser; it does not depend on `__Host-` cookies.
- The bearer session token is stored only in OS keychain/Keystore. It never enters `localStorage`, IndexedDB, cookies or sync state.
- The native `api_request` proxy adds the bearer header; JavaScript receives data, not the token.
- No desktop or mobile client holds a model provider key. Model calls go through `services/model-router`, which owns the gateway token; the desktop keychain holds only the EdApex session token.

## Cloudflare web boundary

`app.llacademy.ng` is the `apps/web` vinext Worker; the previous Pages deployment is rollback. It is not an API and must not contain secrets.

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
