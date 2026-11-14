# `edapex-agent`

The thin, provider-neutral agent runtime. One turn loop shared by the desktop app,
mobile and the browser (via `edapex-agent-wasm`).

| | |
|---|---|
| Crate | `edapex-agent` (`crates/agent`) |
| Targets | native + `wasm32-unknown-unknown` |
| Deps | `serde`, `serde_json`, `thiserror`, `tokio` (sync/macros/rt/time), `uuid`, `memchr` |
| Depended on by | `apps/desktop/src-tauri`, `crates/agent-wasm` |

## The boundary rule

**This crate carries no HTTP stack and no TLS.** The host injects a
`ProviderClient`; the core asks for a stream and consumes `ProviderChunk`s. That
is what lets the same turn loop run on native (host uses `reqwest`) and in a
browser (host uses `fetch`), with no feature flags and no conditional transport.

The core also never touches the filesystem, the keychain, a database or a UI. It
receives settings, emits events, executes host-provided tools, and asks a host
handler for approvals.

## Modules

| Module | Responsibility |
|---|---|
| `protocol.rs` | `AgentEvent` union, errors, approval and tool types — the wire contract |
| `provider.rs` | `ProviderClient` trait, `ChatMessage`, `ProviderChunk`, OpenAI SSE parsing |
| `runtime.rs` | `AgentHost`: turn loop, tool rounds, approvals, interrupt, history |
| `stream.rs` | One SSE framer and one incremental UTF-8 decoder for every host |
| `interrupt.rs` | `InterruptSignal` — flag + epoch + `Notify` |
| `event_hub.rs` | Bounded replay ring for re-attaching a client mid-turn |
| `spawn.rs` | Detached task spawning: `tokio::spawn` native, `spawn_local` on wasm |
| `agui.rs` | Bidirectional AG-UI bridge — the external-agent boundary |

## Details worth knowing before changing it

**History is `Arc`-shared.** `ProviderRequest.messages` is `Arc<[ChatMessage]>` and
message content is `Arc<str>`, so a per-round snapshot is pointer bumps rather
than a deep copy of the conversation. A plain `Vec<ChatMessage>` clone here is a
real, measurable cost on long threads.

**Host traits are target-bounded.** `HostObject` requires `Send + Sync` on native
and nothing on wasm32, because `JsValue` is neither. This exists so the browser
surface can be implemented at all; do not "fix" it by weakening the native bound.

**SSE parsing happens once.** `stream.rs` owns framing and UTF-8 carry. A
second implementation anywhere is a bug: the previous duplicated parser caused a
fix in one host not to reach the other.

**Cancellation is epoch-guarded.** `InterruptSignal::reset_if_epoch` prevents a
deferred reset from erasing a newer cancellation the turn has not yet observed.

**Risk is per-tool.** `DynamicToolName::risk()` and `approval_decisions()` decide
the approval surface. Never hardcode `CapabilityRisk::Read`, and never offer
`AllowForSession` for a write.

**`turn_start` returns when the turn is *accepted*, not when it ends.** The turn
runs on a detached task (`spawn.rs`), and completion arrives as a
`turn_completed` event. Tests must therefore wait for completion rather than
read events immediately — `tests/turn.rs` has `wait_for_completion` for exactly
this reason.

**Re-attach is `EventHub` + `agent_attach(since_seq)`.** The ring is bounded at
1,024 events: it serves a reconnecting client, not transcript storage. History
lives in the thread state, so an unbounded buffer here would leak for the life of
the process.

**AG-UI round-trips must stay lossless.** `risk`, `decisions` and tool `summary`
all survive both directions, and unparseable values fail closed (`Destructive`
risk, `Deny` decision). `tests/agui.rs` and the round-trip tests in `agui.rs` guard
this.

## Provider wire format

The request the host actually transports is **OpenAI Chat Completions**, not a
local envelope. `crates/agent-wasm` serialises `ProviderRequestWire` and the
desktop host posts the same shape, so both share one body:

```json
{
  "model": "openrouter/auto",
  "stream": true,
  "messages": [
    { "role": "assistant", "content": null,
      "tool_calls": [{ "id": "call_1", "type": "function",
                       "function": { "name": "read_student", "arguments": "{}" } }] },
    { "role": "tool", "content": "…", "tool_call_id": "call_1" }
  ],
  "tools": [{ "type": "function", "function": { "name": "…", "parameters": {} } }]
}
```

`snake_case` is load-bearing. `model-router` drops unknown keys rather than
rejecting them, so a camelCase `toolCalls` would not fail — it would disappear,
and tool results would arrive upstream without the correlation id that pairs them
to the call. `stream: true` is always sent; a buffered reply never emits the
`data:` frames the incremental reader consumes.

## Verification

```bash
cargo test -p edapex-agent
cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm
node scripts/check-agent-size.mjs     # native core must stay under 10 MiB stripped
```

`tests/contract_parity.rs` round-trips `packages/contracts/fixtures/agent-events.json`
through `AgentEvent`. A wire-shape change that breaks TypeScript fails here first.

Current size: **~0.59 MiB stripped** against a 10 MiB budget.
