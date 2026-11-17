# @edapex/host

The seam between a UI surface and whatever runs the agent.

## The rule

`crates/agent` is the agent runtime on every host. WebAssembly is one *delivery* of it, not
a second runtime. What differs per host is the transport, and this package is where that is
typed (`docs/system.md` → "transport (host-injected)").

| Module | May import | Used by |
|---|---|---|
| `./platform` | nothing | both hosts |
| `./tauri` | `@tauri-apps/api` (dynamically) | both hosts, but only inside a Tauri WebView |
| `./capabilities` | `./tauri`, `./platform` | both hosts |
| `./api` | `./api/transport` | both hosts |
| `./agent` | `@edapex/chat`, `@edapex/contracts` | both hosts |
| `./agent/native` | `./tauri` | native hosts only |

`./agent` **must not** import `next/*` or `@tauri-apps/*`. It takes an `AgentTransport` and
calls it. That is what lets the Android app reuse the adapter without inheriting the web
app's routing or its cookie transport.

## Adding a host

1. Implement `AgentTransport` (`./agent/transport`) — `kind`, `connect`, `startTurn`.
2. Add a subpath export if it is a first-class transport.
3. Build the adapter with it: `new NativeAgentAdapter(yourTransport)`.

Do not add a branch inside `./agent`. A branch there is how the adapter ended up knowing
which host it was on in the first place.

## What stays in an app

- `apps/web/lib/native-agent.ts` — the browser delivery of `crates/agent` (wasm-bindgen).
- `apps/web/lib/runtime-connect.ts` — the web app's *choice* between transports.
- `apps/web/lib/agent-host.ts` — the web app's policy (`NEXT_PUBLIC_NATIVE_AGENT`).

Those are policy and delivery, not seam.
