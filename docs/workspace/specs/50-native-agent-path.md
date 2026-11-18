# 50 — Native Agent Path (desktop and mobile)

**Status:** amended. Desktop and mobile run **Infinity's native core**
(`infinity-agent-core`) as the single agent runtime; the browser runs the same core
compiled to Wasm. This spec's earlier claim — that a separate EdApex turn loop was
the native runtime — is superseded. Evidence and what remains blocked live in
[`../infinity-agent-acceptance.md`](../infinity-agent-acceptance.md).

One runtime, but **not one store**: the pinned core requires `Send + Sync` store
handles with `Send` futures, which an OPFS-backed store cannot provide. Native
hosts use `agent.db`; the browser uses `infinity-wasm`'s IndexedDB actor handles,
with SQLite-in-OPFS owned by a dedicated worker for the transcript and queue. The
reasoning and the upstream decision records are in the acceptance matrix under
"Why the browser does not use the SQLite store". Nothing in this spec should be
read as claiming a shared database across hosts.

**Rule being enforced** (from `AGENTS.md`): *desktop and mobile are native.
WebAssembly is the web delivery mechanism only. A host that can run native code uses
`crates/*` directly; adding WASM to a native host needs a written justification and a
recorded blocker.*

## What replaced the old loop

| Concern | Now |
|---|---|
| Execution | `infinity-agent-core` through `edapex-agent::NativeAgentDriver`, on a dedicated current-thread `LocalSet` |
| Session identity | caller-owned root `ThreadId`; child threads keep their own ids and ancestry |
| Model context | per-thread snapshots in `agent.db` (messages, compaction summaries, thread info) |
| Execution state | processed ids, subscriptions, pending choices, stopped flag, per root thread |
| Projection | append-only `agent_session_events`, encrypted, paginated; **not** the model's memory |
| Ownership | lease + fence in `agent_sessions`; a stale writer is refused, not merged |
| Headless work | WorkManager claims sessions with queued messages and drains them through the same driver |
| Full feature set | child threads, ancestry, compaction, tool approval, choices and subscriptions are all part of the native path — not deferred to the web |

A turn's durability is a native-host concern. The worker opens the **same**
`agent.db` the window does; two paths would be two histories.

## Audit result (historical): the rule was violated

At audit time, desktop and mobile ran the **WebAssembly** agent, not the native one.
That is no longer true: `build:desktop` and `build:mobile` set `NEXT_PUBLIC_NATIVE_AGENT=1`,
so a Tauri build selects the native transport, and `AgentTransport`
(`packages/host/src/agent/transport.ts`) makes the injection explicit rather than
environmental. The audit below is kept because the failure mode it describes — a transport
that exists but is never called — is easy to reintroduce.

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

## The fix

**Done:**

1. **`apps/web/lib/native-agent-tauri.ts`** — typed wrappers for all seven commands,
   plus a structural guard on the event union. The guard is duplicated from the WASM
   client *deliberately*: the producers are different transports (`tauri::ipc` versus
   a wasm-bindgen callback), so a drift between them is exactly what it catches.
2. **`apps/web/lib/native-runtime.ts`** — connection, `agent_attach` on reload,
   interrupt and approval response, wired to the callback shape the workspace adapter
   already speaks.
3. **`apps/web/lib/agent-host.ts`** — host selection, chosen at **runtime** rather
   than build time, because one bundle serves the browser and the shell and a build
   flag would be two artifacts and two chances to ship the wrong one.
4. **A branch in `agent-runtime.ts`**, with 7 unit tests covering it.

**The default is now native, and the honest caveat stands.** `nativeIsDefault()` reads
`NEXT_PUBLIC_NATIVE_AGENT`, which `build:desktop` and `build:mobile` set to `1`. The
transport still **cannot be verified in CI** — there is no Tauri window in the runner — so
the proof remains the one this spec always specified: delete `public/agent-runtime/`, build
the desktop shell, and run a turn. That gate is carried in `81-mobile-shell.md` §9 and in
the mobile implementation plan; it has not been claimed here.

**Still to do:**

5. **Flip the default** once Android builds and runs — gated on a real device, not on
   a passing typecheck.
6. **Stop shipping the WASM runtime to native hosts.** Once the flip happens,
   `build:agent-runtime` becomes web-only. The budget entry already treats it as a
   lazy asset, so nothing else moves.

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
