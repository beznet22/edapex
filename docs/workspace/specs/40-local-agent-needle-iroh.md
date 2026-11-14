# 40 — Local Agent, Needle 3 and iroh

**Draft.** No implementation in Phase 9B.

## Agent locality

- xcodex runs locally: native Rust in Tauri desktop/mobile; WASM on web and as a mobile Tauri fallback.
- No server-side xcodex.
- The native host is `codex-app-server::in_process` on a Tokio thread, exposed through Tauri commands and a typed `AgentEvent` channel. There is no desktop sidecar and no production SSE path.
- EdApex tools are app-server dynamic tools (`web_search`, `web_fetch`, `ocr_extract`) executed in process. Chrome DevTools MCP is a separate desktop-only, user-installed MCP server; it is not an EdApex child process and is absent on mobile/PWA.
- Needle 3 is the local router/extractor, not the general reasoning model.
- The larger reasoning model is a separate policy decision. If it is remote, keys stay in platform secure storage or an approved gateway; if it is local, device memory and quality are constraints.

## Needle 3

Use Needle 3, not Needle 2. Characteristics:

- 29–121M parameters; 8–29MB binaries; about 35MB default weights.
- Browser/WASM and native Android/iOS C API.
- No Needle 2-style top-5 retrieval head; keep the per-turn toolset small.
- Use `triggers` and confidence; treat `ungroundedFields` as a hard gate for argument values where available.
- Benchmark accuracy, memory, latency and battery on school devices.

## iroh synchronization

Synchronize only agent state/workspace between the user's devices:

- session metadata and event log
- plans/workflow definitions
- workspace files
- not EdApex records
- not user session tokens/cookies
- not API credentials

### Protocol

- Device keys and pairing; Worker-issued device authorization/revocation.
- E2EE per user; iroh transport with relay fallback.
- Content-addressed blobs; state manifest; version vectors/CRDT.
- Local append-only audit.
- Sync allowlist and redaction; if a transcript contains PII, it stays local by policy.
- Conflict resolution and compaction defined before implementation.
- Offline edits queue; no auto-replay of writes.

### Sync authority

- iroh is the preferred transport when peers are online.
- The Cloudflare `AGENT_DB` path remains the durable authority: D1 metadata/events, R2 blobs and canonical cursors.
- iroh relays are stateless and do not provide an offline mailbox; an offline device needs the CF path or an always-on peer.
- A Durable Object is optional for future live co-editing, not the offline store.

### Known limits

- `iroh-ffi` has Kotlin/Swift/Node bindings, not Tauri/RN; use native Rust in Tauri.
- `iroh-blobs`/`iroh-docs` are not included in the FFI surface; implement or wrap them.
- Relay metadata remains visible even with encrypted content.
- Lost-device revocation and backup are product requirements.

## No local school data

A local-first agent is not a local school database. API responses are ephemeral; do not persist student records, marks or parent data in the sync store.
