# 50 — Native Agent Path (desktop and mobile)

**Status:** audit complete, implementation pending.
**Rule being enforced** (from `AGENTS.md`): *desktop and mobile are native.
WebAssembly is the web delivery mechanism only. A host that can run native code uses
`crates/*` directly; adding WASM to a native host needs a written justification and a
recorded blocker.*

## Audit result: the rule is currently violated

Desktop and mobile run the **WebAssembly** agent, not the native one.

| Evidence | Finding |
|---|---|
| `apps/desktop/src-tauri/Cargo.toml` | No `wasm` dependency — the Rust side is correct |
| `apps/desktop/src-tauri/src/agent.rs` | `agent_connect`, `agent_thread_start`, `agent_turn_start`, `agent_approval_response`, `agent_attach`, `agent_close` are all implemented and registered |
| `apps/web/lib/tauri.ts` | **Zero wrappers** for any of them |
| `apps/web/lib/agent-runtime.ts` | `connect()` unconditionally does `new NativeAgentClient(...)`, with no host branch |
| `apps/web/lib/native-agent.ts` | Does not reference `isTauriHost` at all |
| `apps/desktop/src-tauri/tauri.conf.json` | `frontendDist` points at the web build output, so the desktop shell ships the web bundle — and therefore the WASM runtime with it |

So the native capability exists and is unused. The Tauri commands were written and
then the frontend never called them.

**No blocker justifies this.** The native path is present, compiles, and is
registered. This is missing wiring, not a platform limitation.

## Why it matters beyond principle

- **Two runtimes in one binary.** The desktop image carries the WASM core (~172 KB
  gzip, plus glue) *and* the native core it never calls.
- **A different set of behaviours.** The native path uses
  `tauri::ipc::Channel<AgentEvent>` and the OS keychain; the WASM path uses
  `crypto.getRandomValues` and the WebView's storage. Divergence between hosts is
  how "works on web, not on desktop" bugs appear.
- **The wrong one is tested.** `crates/agent-wasm` is gated to `wasm32`, so the
  desktop build never exercises the code it actually ships.

## The fix, in order

1. **`apps/web/lib/tauri.ts`** gains typed wrappers for the seven agent commands,
   matching the existing style there (`invokeCommand<T>`).
2. **A host-aware client.** `agent-runtime.ts` selects a `NativeAgentAdapter` when
   `isTauriHost()` is true and the WASM adapter otherwise. The interface is already
   `WorkspaceRuntimeAdapter`, so this is a second implementation, not a rewrite.
3. **`agent_attach` on reconnect.** The native side already swaps the channel before
   replay, so a mid-turn reload re-attaches; the WASM side cannot do this as well
   because its state is per-page.
4. **Stop shipping the WASM runtime to native hosts.** Once the web bundle no longer
   needs it under Tauri, `build:agent-runtime` becomes a web-only concern. The budget
   entry already treats it as a lazy asset, so nothing else moves.

## Verification

- The desktop must start a turn with **the WASM runtime absent** from
  `public/agent-runtime/`. That is the test: delete it, then run a turn.
- `cargo check` on the desktop crate.
- A unit test asserting host selection, so the branch cannot silently revert.

## Open

- **Unverified on a real desktop window.** No runner for Tauri here; the Linux build
  compiles but launching a window is not part of CI. This is stated rather than
  implied.
- Mobile inherits the same fix, but its verification is blocked on the same thing as
  `gen/ios/` — a macOS host.
