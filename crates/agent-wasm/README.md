# `edapex-agent-wasm`

The browser surface for `edapex-agent`. Compiles the turn loop to
`wasm32-unknown-unknown` and exposes it to JavaScript through `wasm-bindgen`.

| | |
|---|---|
| Crate | `edapex-agent-wasm` (`crates/agent-wasm`) |
| Crate type | `cdylib` + `rlib` |
| Target | `wasm32-unknown-unknown` only |
| Output | `apps/web/public/agent-runtime/` |

## Recent measured size

```
agent wasm:    324,205 raw · 120,710 gzip   (budget 1,200,000)
agent js glue:  26,508 raw ·   5,389 gzip   (budget    60,000)
```

The `xcodex` payload it replaced was **9.9 MB**. This is roughly a 98% reduction
on that asset, and it is why retiring xcodex is a size win rather than a cost.

## How the host plugs in

The core performs no I/O, so this crate hands every outbound concern to
JavaScript:

| Concern | Direction | Bridge |
|---|---|---|
| Provider stream | core → JS | `on_request(requestJson)`; JS pushes back via `push_chunk` |
| Stream end | JS → core | `end_stream()` |
| Tool execution | core → JS | `on_tool(callJson)` returns a `DynamicToolResult` |
| Approval | core → JS | `on_approval(requestJson)` returns a decision |
| Events | core → JS | `on_event(eventJson)` |

`ChunkQueue` is a **rendezvous, not a buffer**. The JavaScript fetch does not
start until `stream_chat` has returned, so draining eagerly would deadlock the
first turn. `recv()` waits for the next item and re-checks after every wake.

## Why tokio works here

Verified, not assumed: `tokio` with `macros`, `rt`, `sync` and `time` compiles for
`wasm32-unknown-unknown`. The only blocker found was `uuid`, which needs the `js`
feature for a randomness source. No executor swap was required.

## Building

```bash
# from apps/web — builds, runs wasm-bindgen, and enforces the size budget
pnpm --dir apps/web run build:agent-runtime
```

Do not run `wasm-bindgen` by hand into `public/`; the script is what applies the
budget gate and writes the artifacts the app imports.

**Do not set `strip = true`** on the release profile. It removes the
`target_features` custom section, and `wasm-bindgen` then cannot detect which Wasm
features the artifact uses. Reduce size with `wasm-opt` on the bindgen output
instead.

## Boundary rules

- The provider credential never crosses this boundary. JS fetches
  `/api/v1/agent/chat`, which the server proxies; the browser never holds a key.
- An unrecognised approval answer fails **closed** to `Deny`.
- Every v1 tool declares `requires_approval() == true`.
- `contractVersion()` mirrors `AGENT_CONTRACT_VERSION` in
  `packages/contracts/src/agent.ts`.
