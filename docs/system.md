# System

**Status:** authority for the host split, the agent runtime and the transport between
them. Where this file and a spec disagree, this file wins; where this file and the code
disagree, the code wins and this file is wrong — fix it here.

**Reconciled:** 2026-11-18 against `2c2b4a4` (Chunk 5 closure).

## Summary

- **Three hosts, one UI bundle.** Web PWA, Tauri desktop and Tauri Android all run the
  same React bundle in a WebView. A host difference is a token resolved at the edge, not
  a forked component.
- **One agent runtime.** `crates/agent` wraps Infinity's core (`infinity-agent-core`).
  Desktop and Android run it natively in-process; the web runs the same core compiled to
  Wasm (`crates/agent-wasm`) inside **one dedicated worker per tab**.
- **The transport is host-injected.** Web uses `fetch(credentials: "include")`; native
  uses `reqwest` with the token from the OS keychain. The WebView never holds a bearer
  token or a provider key, and the model-router is the only holder of a provider key.
- **One transcript, two stores.** The browser's transcript and queue are SQLite in OPFS
  through the official `@sqlite.org/sqlite-wasm` (`opfs-sahpool`), owned by the worker.
  Native hosts use `agent.db` (rusqlite, bundled). Infinity's model memory is a separate
  store on the web (IndexedDB) because the pinned core requires `Send + Sync` handles
  that an OPFS store cannot provide — see spec 50.
- **Durable records go through `crates/store`:** per-record XChaCha20, an outbox written
  in the same transaction, a journal, and a derived FTS index that is rebuildable and
  never synced.
- **Services.** `sms-api` owns the school database and serves the model proxy;
  `cowork-api` owns `AGENT_DB`; `model-router` is the only key holder.

## Request path

```text
web tab                 desktop window              android
   │                          │                         │
   └────────────── one React bundle in a WebView ───────┘
                              │  AgentEvent (JSON, one contract)
                ┌─────────────┴─────────────┐
          WEB (Wasm)                    NATIVE (Rust)
   dedicated worker, Web Lock       AgentHost in-process
   crates/agent-wasm                crates/agent
   OPFS SQLite + IndexedDB          agent.db
   in-memory state dies with tab    survives the process
                └─────────────┬─────────────┘
                     host-injected transport
        web: fetch(credentials: include) · native: reqwest + keychain token
                              │
                   sms-api model proxy
                   /api/v1/agent/model/chat/completions
                              │
        model-router (private Worker, only key holder)
        cf-aig-collect-log: false · BYOK alias · model allowlist · token cap
                              │
                    AI Gateway → provider (OpenRouter…)
```

### Inside the WebView

| Layer | Rule |
|---|---|
| Ported OpenDüet interaction layer (spec 43) | transcript · composer · ActionBar · tool-activity pills · queue · Streamdown ← `message_delta` |
| Workspace shell | persistent layout owns session, runtime and chrome; Chat · Tasks · Make; titlebar on desktop only; theme |
| genui renderer | OpenUI Lang → catalog check → React components. An unknown node is **rejected**; generated code is **never** `eval`ed |

### Native host surface

| Piece | Role |
|---|---|
| `AgentHost` + `EventHub` (ring + sequence) | replayed from a sequence number, so a reconnecting window misses nothing |
| `tauri::ipc::Channel<AgentEvent>` | events out to the WebView; one contract with the web branch |
| `agent_turn_start`, `agent_approval_response`, `agent_attach(since_seq)` | invoke commands; request/response only |

### Streaming

The model answers with OpenAI `data:` frames. The payload parser is implemented once in
`crates/agent/src/provider.rs` (`parse_openai_sse_data`) and used by **both** hosts; the
browser's byte framer (`SseFramer` in `crates/agent-wasm`) wraps the shared
`take_sse_event` helpers. Tool-call deltas are assembled in
`crates/agent/src/infinity_stream.rs`, because the pinned core does not assemble them.

### Services

| Service | Owns |
|---|---|
| `services/sms-api` | school DB · sessions · tenant middleware · the `/agent/model` proxy |
| `services/cowork-api` | `AGENT_DB` · approvals · connectors · gateway (policy → audit → act). **Session sync is planned, not shipped** (Chunk 6) |
| `services/model-router` | the only provider key holder: BYOK alias, model allowlist, token cap |

**AG-UI boundary** (optional, spec 17): an external agent speaks AG-UI, `agui.rs` maps it
to `AgentEvent`, and the same UI renders it. It requires admin approval, and grants are
never derived from the creator.

## Local storage

| Concern | Web | Native |
|---|---|---|
| Transcript | SQLite in OPFS, `@sqlite.org/sqlite-wasm` on `opfs-sahpool`, opened **only** in the dedicated worker (sync access handles are worker-only) | `agent.db`, rusqlite (`bundled`) |
| Model memory | `infinity-wasm` IndexedDB actor handles | the same `agent.db` |
| Transcript key | 32-byte DEK in web local storage (`edapex.infinity.key.<workspace>`); a corrupt key reports `storage_corrupted` and is never rotated | OS keychain |
| Sync master key | separate OPFS file (`lib/device-identity.ts`), not a row and not the database artifact | OS keychain |
| Ownership | one exclusive Web Lock per session, taken before storage opens, held for the runtime's lifetime | lease + fence in `agent_sessions` |
| Search | FTS5 (`messages_fts`), derived, rebuildable, never synced | same table, same semantics |

Sealing is per record (XChaCha20), the outbox and the record share one transaction, and
the journal is what a restarted native host resumes from.

## What the diagram does not show

- **Two frontends.** `apps/web` (browser and the desktop window) and
  `apps/desktop/mobile` (Android, Vite + React). They share `tokens`, `ui` and `host`,
  never each other.
- **The package layer.** `@edapex/tokens` (design values, CSS only), `@edapex/ui` (shadcn
  primitives), `@edapex/host` (transport · api · agent adapter), `@edapex/chat` (runtime
  state machine + Markdown), `@edapex/genui` (OpenUI renderer), `@edapex/documents`
  (artifact editor), `@edapex/connectors` (server-only catalogue, never in a bundle),
  `@edapex/contracts` (wire shapes and their guards).
- **The native run host.** `RunWorker` (WorkManager) → `RunService` (foreground service,
  type `specialUse`) → `AgentHost`, with `runs` / `run_events` in `crates/store` as the
  journal a reboot resumes from.
- **Notifications.** Four channels: run · approval · done · routine. Push carries
  approval and completion only while the app is backgrounded; execution stays local.

## Web durability, precisely

A page reload ends the worker and with it the in-memory session: the model context and the
queue are gone from memory. The **transcript and queue are not** — they are rows in OPFS,
and the next worker takes the lock, reopens the same database and resumes the session from
the stored view. A second tab does not share that work: it is refused with `lease_locked`
and never touches the files. This is why the web branch needs no `EventHub`: the durable
record is the recovery mechanism, and it is tested by reloading the page mid-conversation.

## Where the detail lives

| Question | Document |
|---|---|
| Local schema, sync, encryption, FTS | [`workspace/specs/41-storage-sync.md`](workspace/specs/41-storage-sync.md), [`42-agent-db-schema.md`](workspace/specs/42-agent-db-schema.md) |
| Native vs Wasm runtime, stores, what the wasm crate changes | [`workspace/specs/50-native-agent-path.md`](workspace/specs/50-native-agent-path.md) |
| Local capability layer, tool authority | [`workspace/specs/48-local-capability-layer.md`](workspace/specs/48-local-capability-layer.md) |
| Mobile shell, insets, WorkManager | [`workspace/specs/81-mobile-shell.md`](workspace/specs/81-mobile-shell.md) |
| Evidence, acceptance matrix, browser support | [`workspace/infinity-agent-acceptance.md`](workspace/infinity-agent-acceptance.md) |
| Repository rules, caps, verification commands | [`AGENTS.md`](../AGENTS.md) |
