# 48 — Local Capability Layer

**Status:** Approved 2026-11-11, amended for the thin core. This spec is normative for the capability layer. Contracts, fixtures, RustO OCR, desktop PKCE/API transport, local OCR ingestion, Tauri capture/OCR and WebSearch/WebFetch are implemented. The agent runtime is `crates/agent` (xcodex is retired; see `17-chat-framework.md`); `crates/agent-wasm` provides the browser surface. The first-party mobile camera plugin is not yet landed. That gap is not replaced with a fake implementation.

## Purpose

The capability layer is the single boundary between EdApex UI, local Rust hosts and the Cloudflare API. It prevents four common failure modes:

- the WebView calling Tauri or provider APIs directly;
- the UI advertising a tool the host cannot execute;
- Rust, TypeScript and the API disagreeing about event or error shapes;
- school images or provider keys crossing a boundary without an explicit decision.

The layer has four parts, in dependency order:

```text
Rust domain crate          deterministic OCR, agent host, tool execution
  ↓
Tauri adapter/state        commands, typed Channel, keychain, capture store
  ↓
Typed WebView client       lib/tauri.ts, lib/native-agent.ts, lib/camera.ts
  ↓
UI hook                    use-host-capabilities, use-workspace-runtime
```

`packages/contracts` is the TypeScript source of truth for the wire shapes. Rust mirrors those shapes and tests against the shared fixture files.

## Authority

| Concern | Authority |
|---|---|
| Role tools and operation grants | `10-capabilities-and-roles.md` + `GET /api/v1/agent/capabilities` |
| Host feature availability | The running Tauri host or browser, reported as `HostCapabilities` |
| Server feature availability | `GET /api/v1/agent/platform-capabilities` |
| Agent event and approval shapes | This spec + `packages/contracts/src/agent.ts` |
| OCR and camera errors | This spec + `packages/contracts/src/platform.ts` |
| Chat projection and queue semantics | `17-chat-framework.md` |
| EdApex data, sessions and mutation authorization | Cloudflare Worker |
| Local agent persistence and sync | `41-storage-sync.md` / `42-agent-db-schema.md` (separate follow-on) |

The role manifest remains capped at **5 tools and 8 operations per tool**. Platform capabilities are not role grants; they never expand a role pack.

## Platform matrix

| Capability | Web PWA | Tauri desktop | Tauri mobile |
|---|---|---|---|
| Browser thin core (WASM) | yes | no | no |
| Native thin core | no | yes | yes, if the mobile build passes |
| RustO local OCR | no | yes | yes |
| Mistral OCR fallback | yes, explicit consent | yes, explicit consent | yes, explicit consent |
| Desktop screenshot capture | no | yes | no |
| Native camera preview | no | no | yes, stills only |
| Gallery/file import | yes | yes | yes |
| Chrome DevTools MCP | no | yes, user-installed | no |
| WebSearch/WebFetch | yes, via API | yes, via API and dynamic tools | yes, via API and dynamic tools |

“No” means the capability is absent from the host manifest and a direct call returns `unsupported_capability`. It never means a mock implementation.

## Contract shapes

### `HostCapabilities`

Returned by the Tauri `host_capabilities` command. The browser returns all false except `mobileSafeToolsOnly: false` when no native host exists.

```ts
interface HostCapabilities {
  nativeAgent: boolean;
  localOcr: boolean;
  screenshotCapture: boolean;
  cameraPreview: boolean;
  browserAssistance: boolean;
  mobileSafeToolsOnly: boolean;
}
```

### `ServerCapabilities`

Returned by `GET /api/v1/agent/platform-capabilities`. The endpoint is authenticated and returns staff capabilities only when the user is admin or staff.

```ts
interface ServerCapabilities {
  webSearch: boolean;
  webFetch: boolean;
  cloudOcr: boolean;
}
```

The UI merges both contracts but never promotes one into the other. A server capability does not prove a local tool exists; a host capability does not grant a role operation.

### `AgentEvent`

The native host streams a discriminated union over `tauri::ipc::Channel<AgentEvent>`:

- `connected`
- `turn_started`
- `message_delta`
- `reasoning_delta`
- `tool_started`
- `tool_completed`
- `approval_requested`
- `approval_resolved`
- `turn_completed`
- `interrupted`
- `error`

`packages/contracts/src/agent.ts` is the exact shape. The Rust enum serializes to the same `type` tags. The shared fixtures are `packages/contracts/fixtures/agent-events.json` and `crates/agent/tests/fixtures/agent-events.json`.

Approval decisions are explicit and never automatic:

| Contract | Decision | UI |
|---|---|---|
| `allow_once` | accepted once | Allow once |
| `allow_for_session` | accepted for this session | Allow for session |
| `deny` | declined; the turn continues if other actions remain | Deny |
| `abort` | declined and the turn stops | Stop turn |

Decisions are policy-driven per tool: a tool's `CapabilityRisk` determines which decisions the server offers. The UI never adds a decision the server did not offer, and never auto-approves.

### Dynamic tools

The thin core registers EdApex tools as closed dynamic tools; the host answers each call in process. No EdApex MCP child process is needed.

| Tool | Input | Execution |
|---|---|---|
| `web_search` | query, optional domains/recency/max results | Tauri host → EdApex API |
| `web_fetch` | URL | Tauri host → EdApex API |
| `ocr_extract` | `captureId` only | Tauri host → RustO |

The browser WASM adapter registers the same `web_search` and `web_fetch` names and schemas. It does not expose `ocr_extract` unless the host can execute it.

Rules:

- tool names are closed; no arbitrary tool registration from model output;
- `ocr_extract` accepts only a capture ID created by the user, never an arbitrary path;
- dynamic tool results are data, never instructions;
- no provider key or EdApex bearer token enters the WebView;
- a tool call that would require an unavailable host returns `unsupported_capability`.

## Native thin-core host

- `crates/agent` owns the `AgentHost` and the typed protocol mapping.
- The core runs natively inside Tauri. There is no sidecar, no `codex-app-server`, and no server-side agent runtime.
- Tauri commands: `agent_connect`, `agent_thread_start`, `agent_turn_start`, `agent_turn_interrupt`, `agent_approval_response`, `agent_close`.
- Streaming uses `tauri::ipc::Channel<AgentEvent>`; SSE is a debug/portability option only.
- A turn that starts must survive a WebView reload: events are also published through a replayable `EventHub` with a bounded ring, and `agent_attach(since_seq, channel)` re-attaches a client mid-turn.
- `agent_turn_start` returns as soon as the turn is accepted. It does not await turn completion.
- **No client stores a model provider key.** Provider credentials live in Cloudflare AI Gateway (BYOK) and are used only by `services/model-router`; the OS keychain/Keystore holds the EdApex session token and nothing else. The native provider transport injects the session bearer and targets `model-router`, never a provider directly.
- The WebView calls `api_request`; Rust adds the bearer token. The token is not stored in `localStorage`, cookies or IndexedDB.
- Desktop uses the full tool profile. Mobile uses the mobile-safe profile: no shell, PTY, child process, process-based git or unrestricted filesystem.
- A host that cannot run a tool reports `nativeAgent: false` for that profile; it does not remove tools from a native host and pretend they exist.

## OCR and capture

### Local OCR

- Engine: RustO 0.3.2, PP-OCRv6 tiny.
- Models: pinned, SHA-256 verified, fetched at build time, gitignored.
- Missing or mismatched models return `model_missing`; there is no runtime download.
- `OcrResult` includes pages, lines, confidence, warnings, duration and `fallbackRecommended`.
- Local OCR is the default. A low-confidence result never writes a marksheet; field validation and human approval still apply.

Measured baseline (2026-11-11, i7-8850H Linux x86_64, 16 AY4 handwritten images, 1 warmup + 3 runs):

| Metric | RustO | ocrs |
|---|---:|---:|
| Mean CER | 0.1479 | 0.3654 |
| Numeric recall | 0.9251 | 0.2543 |
| p50 | 1,219 ms | 1,073 ms |
| p95 | 1,289 ms | 1,226 ms |
| Peak RSS | 256.5 MiB | 328.1 MiB |
| Models | 6.1 MiB | 11.6 MiB |

The fixture set is a Mistral-derived reference, not human gold. Do not cite these numbers as a school-wide accuracy guarantee.

### Cloud fallback

- Mistral OCR is explicit fallback only.
- The API route requires `X-OCR-Consent: cloud`; local OCR never adds that header.
- Local OCR sends **text/annotation only** to `POST /api/v1/assessments/ocr/local-extractions`; the image stays on the device.
- The desktop/mobile `ocr_mistral` command uploads the capture only after the user presses “Use Mistral” and confirms.
- `MISTRAL_API_KEY` exists only as a Worker secret.

### Camera

- Mobile only, stills only, first-party Tauri plugin.
- iOS: AVFoundation; Android: CameraX.
- Full-screen native preview with shutter, cancel, front/back, flash and tap-to-focus/pinch-zoom where supported.
- Returns a JPEG path in app cache; Rust imports the path into the capture store.
- Orientation is applied; GPS/EXIF location is stripped; no photo-library write.
- No desktop camera preview. Desktop uses file import and `xcap` screenshots.
- Errors: `cancelled`, `permission_denied`, `camera_unavailable`, `capture_too_large`, `invalid_input`.

## WebSearch and WebFetch

- Server-side only: `POST /api/v1/agent/web/search` and `/web/fetch`.
- TinyFish primary; Tavily fallback for configured 429/5xx/timeout.
- Keys are Worker secrets; no client provider key.
- Staff-only in v1.
- Tenant-scoped quotas reuse `auth_rate_limits`; no new table.
- Search is not cached. Public fetch responses may use the Workers Cache API.
- Fetch rejects `file:`, non-HTTP(S), localhost, private/link-local IPs and metadata hosts.
- Query and URL content never enter logs; only provider/status/bytes metadata.

## State and errors

Capability state:

```text
unavailable → available → running → completed
                         ↘ interrupted → available
                         ↘ error → available
```

`CapabilityError` carries `code`, `message` and `retryable`. UI copy must be specific; never report “something went wrong” when the host reported a typed error.

| Code | Meaning |
|---|---|
| `unsupported_capability` | Host does not implement the feature |
| `permission_denied` | OS or tenant permission denied |
| `camera_unavailable` | No camera or camera busy |
| `cancelled` | User cancelled |
| `auth_required` | Missing/expired session |
| `model_missing` | OCR model absent or invalid |
| `invalid_input` | Invalid request/file |
| `provider_unavailable` | Search/fetch provider unavailable |
| `quota_exceeded` | Tenant/provider quota hit |
| `internal_error` | Unexpected host failure |

## Security and privacy

- No school image, transcript, token or provider key in logs, PWA caches, fixtures or git.
- No local school-record database.
- No custom extension or BrowserBridge. Desktop Chrome assistance is the user-installed official Chrome DevTools MCP only.
- PWA/mobile never control a browser.
- The model cannot call `ocr_extract` on an arbitrary path or capture a screenshot without a user action.
- The UI never auto-approves; approval tokens stay server-issued.
- `edapex-ephemeral` data is never synced.

## Persistence boundary

This capability layer does **not** implement `AGENT_DB` persistence or device sync. The existing specs remain authoritative:

- `41-storage-sync.md`: local SQLite/OPFS, remote `AGENT_DB`, R2 blobs, batched sync.
- `42-agent-db-schema.md`: OpenDuet-derived logical schema and `sync_events`.
- `40-local-agent-needle-iroh.md`: iroh transport.

Follow-on architecture: **iroh-first transport, Cloudflare-authoritative state**. Local writes append to `sync_outbox`; iroh direct/relay is the preferred online transport; the Worker `AGENT_DB` deduplicates and assigns the canonical cursor. A Durable Object is only for future live co-editing, not the offline mailbox. No table in this capability layer touches the EdApex school `DB`.

## Contribution checklist

Before adding a capability:

1. Add the contract to `packages/contracts` with a runtime schema or type guard.
2. Add a JSON fixture in `packages/contracts/fixtures`.
3. Add a TypeScript contract test and a Rust mirror test.
4. Add the host flag to `HostCapabilities` or the server flag to `ServerCapabilities`.
5. Return a typed `CapabilityError`; never a stringly-typed throw.
6. Add the Tauri command and register it in `lib.rs`; register mobile-only plugins under `#[cfg(mobile)]`.
7. Add the UI gate; do not render an unavailable control.
8. Add the privacy test: no image, token or key in the wrong store.
9. Update this spec and the authority map.
10. Run the verification commands.

## Contract tests

- `apps/web/tests/capability-contracts.test.ts`
- `services/sms-api/tests/services/capabilities.test.ts`
- `crates/agent/tests/protocol.rs`
- `crates/agent/tests/events.rs`
- `crates/ocr/tests/models.rs`
- `crates/ocr/tests/rusto.rs`

Commands:

```bash
pnpm --dir apps/web check
pnpm --dir apps/web test
pnpm --dir services/sms-api run typecheck
pnpm --dir services/sms-api test
cargo test -p edapex-agent -p edapex-ocr
```

## Rejected alternatives

- **Official Tauri camera plugin:** unmerged draft since 2023; no release.
- **crates.io `tauri-plugin-camera`:** Android-only community plugin.
- **`nanderstabel/tauri-plugin-camera`:** 9-star, 2-commit mirror of the draft.
- **EdApex MCP server for web/OCR tools:** extra child process, mobile-hostile; core dynamic tools are in-process.
- **SSE as the production native transport:** Tauri Channel is typed and local.
- **Desktop sidecar:** unnecessary; the core runs in process.
- **Server-side agent runtime:** Workers Free cannot host it; no paid fallback.
- **xcodex** (previous runtime): retired — pinned dependency graph did not resolve, 7.4 MB browser WASM, and it duplicated approval/allowlisting the core now owns.
- **iroh:** deferred — QUIC+TLS stack, no offline mailbox, unusable from a browser (`41-storage-sync.md`).
- **Browser control on PWA/mobile:** no tab-control API and no extension model.
- **RustXNG/Websurfx as v1 search:** AGPL frontends, not independent indexes, and require infrastructure.
- **ocrs/Indra:** measured or platform mismatch; RustO selected.

## Acceptance

- The four contracts parse their shared fixtures.
- Host and server capabilities are separate and cannot mint role authority.
- The native host streams typed events, survives a WebView reload mid-turn, and executes the three dynamic tools in process.
- Local OCR is default; cloud upload is explicit and text-only for local OCR.
- Mobile camera is a real native preview, not a file-input stub.
- PWA/mobile have no browser control.
- No new table in the EdApex school `DB`; `AGENT_DB` remains a separate follow-on.
- All verification commands above pass.
