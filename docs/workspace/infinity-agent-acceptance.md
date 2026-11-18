# Infinity agent runtime — acceptance matrix

**Status:** Living. Records what has actually run, on which host, and what is
blocked. A row is `pass` only with a command and its result; compilation alone is
never a pass for a user-visible behaviour.

Pinned runtime: `beznet22/infinity` at `f82ae44843e6b927786502ebea0910eec13640e9`
(Apache-2.0), consumed as git dependencies with `default-features = false`.

## Host model

| Host | Runtime | Store |
|---|---|---|
| Web | `infinity-agent-core` compiled to Wasm | IndexedDB conversation + state stores, OPFS projection |
| Desktop (Linux, Windows) | native `infinity-agent-core` on a dedicated `LocalSet` thread | `agent.db` (SQLite, WAL, XChaCha20 per record) |
| Android | the same native driver | the same `agent.db` path under app data |

One session is one caller-owned root `ThreadId`. Child threads keep their own ids
and ancestry. Compaction summaries, subscriptions, pending choices and stopped
state are persisted, so a restart resumes the conversation the model saw — not
merely a transcript the UI can redraw.

### Why the browser does not use the SQLite store

Infinity declares `ConversationStore` and `StateStore` as `Send + Sync` with
`Send` futures on every target, so a store that owns a `JsValue` cannot implement
either. The pinned source tried relaxing those bounds and reverted it — recorded
in `docs/docs/WASM/PROGRESS.md` (2026-11-17, "Blocked, not built"): a `!Send`
handle fails at `event_processor.rs:209` and `system/local/router.rs:338`. Its own
answer is the one adopted here: a `Send + Sync` actor handle whose `!Send`
IndexedDB connection lives in a `LocalSet` task (upstream D38/D39).

The browser persists in two layers, and they are not interchangeable:

| Layer | Engine | Owner |
|---|---|---|
| Model memory (conversation, state) | IndexedDB | `infinity-wasm` actor handles |
| Transcript, queue, projection | SQLite in OPFS | a dedicated module worker |

Two workers are a constraint, not a preference: `createSyncAccessHandle()` is
exposed only in a dedicated worker, so the OPFS worker cannot also be the shared
authority. A shared worker proxies to it.

A row may read `pass` for `agent.db` on native and `pass` for IndexedDB on web.
No single store backs every host, and this matrix must not imply one does.

`crates/agent/src/infinity_stream.rs` is shared by both: the request translation
and the tool-call assembly are one implementation, because the pinned core does
not assemble incremental arguments and a divergent copy would reach the model as
malformed JSON.

## Executed

| Area | Evidence | Result |
|---|---|---|
| Upstream admission | `bash scripts/check-wasm.bash`, `bash scripts/check-android.bash` at the pinned revision | pass |
| Wire contracts | `cargo test -p edapex-agent --test contract_parity` (10 tests), `vitest run --root packages/contracts tests/session.test.ts` (6 tests) | pass |
| Context resume | `crates/agent/tests/infinity_driver.rs::provider_context_survives_recreation_and_isolates_sessions` — turn A, a second session, destroy engine, turn B; B's provider request contains A and not the other session | pass |
| Child threads and ancestry | `crates/agent/tests/durable_stores.rs::all_thread_and_execution_state_survives_a_fresh_open` — spawned child, fresh-context boundary, ancestor chain, compaction summary, subscriptions, pending choice, stopped flag | pass |
| Retry | `infinity_driver.rs` — a repeated command id causes no second model call and no duplicate projection | pass |
| FIFO | `infinity_driver.rs::an_existing_queue_and_a_new_send_preserve_fifo` | pass |
| Approval denial | `crates/agent/tests/tool_registry.rs` — denied tool never executes, is reported `declined`, and the model receives the denial | pass |
| Cancellation | `crates/agent/tests/session_lifecycle.rs` — `interrupted` then `turn_completed(stopped)`; plain user text resumes and reaches the model | pass |
| Stall detection | `session_lifecycle.rs::a_stalled_provider_fails_visibly_instead_of_hanging` | pass |
| Ownership | `session_lifecycle.rs::a_second_live_client_cannot_claim_the_same_session` | pass |
| Store durability | `crates/store/tests/infinity_durability.rs` — stale writer rollback, command dedup, snapshot reopen, corruption visible, deletion | pass |
| Desktop host | `cargo test -p edapex-desktop` (16 tests) and `cargo check -p edapex-desktop` | pass |
| Wasm artifact | `cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm`, `node scripts/check-agent-size.mjs` → 650,568 bytes against a 10 MiB budget | pass |

## Blocked

| Gate | Why it is blocked | What would unblock it |
|---|---|---|
| Desktop real-window acceptance (Linux, Windows) | no Tauri window in this runner; `cargo check` compiled the whole crate but a window cannot be opened headless | run the app on each OS: send, queue, progress, approval, completion, restart, and a turn with `public/agent-runtime/` deleted |
| Android device acceptance | no approved device attached here | build the APK, run a turn, kill the process, relaunch, confirm turn B carries turn A's context; verify the foreground service and lease renewal |
| Browser runtime | the web surface still calls the legacy EdApex Wasm bridge; the Infinity browser session (SharedWorker authority, IndexedDB core stores, OPFS projection) is not implemented in this branch | implement `crates/agent-wasm` Infinity session + SharedWorker, then Playwright Chromium/Firefox/WebKit for resume, two-tab ownership, and deletion |
| Cross-device sync | `services/cowork-api` has no session-event/lease/ACL endpoints yet | chunk 6 in the plan: authenticated push/pull, D1 lease+fence, CORS, quotas, deletion propagation |
| Sync wiring on hosts | depends on the service endpoints | chunk 7 |

## Security posture in this branch

- The WebView never holds the session token or a provider key; native requests go
  through the host with the keychain token.
- The agent database is sealed per record; a different key cannot read a session
  (asserted in `apps/desktop/src-tauri/tests/agent_session.rs`).
- External tools stay allowlisted (`web_search`, `web_fetch`, `ocr_extract`) and
  keep the existing approval semantics. Infinity's internal thread tools are
  available; no dynamic third-party Wasm tool installation exists.
- FCM/GCM is configured for Android but is **not** on the local execution path:
  execution is WorkManager + foreground service + `agent.db`. Push only carries
  approval and completion notifications while the app is backgrounded.

## Reproduce

```bash
cargo test -p edapex-agent -p edapex-store
cargo test -p edapex-desktop
cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm
node scripts/check-agent-size.mjs
pnpm --dir apps/web exec vitest run --root ../../packages/contracts tests/session.test.ts
pnpm --dir apps/web run check
```
