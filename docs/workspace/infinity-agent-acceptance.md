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

## Browser turn: the five defects that kept it from the provider

A turn that is accepted and never reaches the model looks identical to a healthy
one from the page, because a worker's console never reaches
`page.on("console")`. The trace that made this observable is
`crates/agent-wasm/src/browser_trace.rs`, bounded to 64 marks and read through
`WasmSession::debug_trace` via the worker's `diagnostics` request and
`InfinityBrowserClient.debugTrace()`. What it proved, in order:

1. **The spec never sent a turn.** `probe(page, id)` was called without
   `{ send: true }`, so `startTurn` never ran and the assertions on provider
   invocation and completion could not pass. Every conclusion drawn before this
   was measured against a test that never exercised the path. The shared probe
   now returns `submitted`, set only when `startTurn` resolves, and the
   regression asserts it before asserting the provider.
2. **Stream ids could not cross the boundary.** `push_chunk`, `push_error` and
   `end_stream` took `u64`, which wasm-bindgen satisfies only with a `BigInt`,
   so every chunk threw `Cannot convert 1 to a BigInt` and the turn ended
   silently. They are `u32` end to end; a per-session counter has no business
   being wider than the only caller language can express.
3. **Every event carried `threadId: ""`.** `BrowserTurnLifecycle::set_root` was
   dropped while adding instrumentation, and the contract rejects an empty
   thread id (`z.string().min(1)`), so the client discarded `turn_started`,
   `message_delta` and `turn_completed` as malformed.
4. **History was appended twice.** `observe` ended with
   `events.append(&mut self.history)` twice, emitting duplicate
   `turn_started`/`turn_completed` rows for one turn.
5. **A corrupt data key was silently replaced.** `dataKey` generated a fresh
   32-byte key whenever the stored one was unreadable, which would make every
   record already encrypted with the old key permanently unreadable. It now
   reports `storage_corrupted` and never rewrites the key, and restoring the
   real key reopens the same transcript.

Each has a regression in `e2e/infinity-regressions.spec.ts`; error propagation
and interruption are in `e2e/infinity-turn-failure.spec.ts`; the shared probe is
`e2e/support/browser-probe.ts`.

### The derived search index had two desyncs

Found by the FTS5 acceptance work, both fixed in `crates/store`:

- `write_record` appended to `messages_fts` instead of replacing the row for that
  message, so an update kept matching text the record no longer contained, and a
  delete left the record findable. It now deletes the message's rows first, and
  only indexes `messages`, the table the rebuild reads.
- `rebuild_search_index` indexed every `messages` row, so it made deleted
  content findable again. The durable marker is the existing `deleted_at`
  column — the outbox cannot serve, because it is pruned once a deletion is
  acknowledged.

Both are covered by `search_index_follows_updates_and_deletes` in
`crates/store/tests/store.rs`.

### FTS5 in the browser is verified in the engine, not through the page store

The worker proves the engine it actually runs: the `diagnostics` response
carries `fts`, read from `sqlite_compileoption_used('ENABLE_FTS5')` plus the
existence of `messages_fts` in `sqlite_master`. It is asserted in
`e2e/infinity-regressions.spec.ts`.

The full search API (`search`, `rebuildSearchIndex`) cannot be exercised from a
page: `opfs-sahpool` needs `createSyncAccessHandle`, which browsers only expose
in dedicated workers. That is why the pre-existing `e2e/browser-store.spec.ts`
fails with `Missing required OPFS APIs` (2 of 4 tests) and why
`apps/web/hooks/use-agent-store.ts` cannot open the store on the page. The FTS
semantics themselves are verified against real SQLite in `crates/store` (42 tests
across targets), and the browser store moves into a worker as part of the sync
work — **deferred, not passed**.

### WebKit cannot open a sync access handle, and it is not our code

`e2e/infinity-opfs-probe.spec.ts` runs twenty lines that touch no EdApex code:
`navigator.storage.getDirectory()` → `createSyncAccessHandle()` → write → read.
Chromium and Firefox write and read back `"hi"`; Playwright's WebKit throws
`UnknownError: The operation failed for an unknown transient reason (e.g. out of
memory)`, the same error every WebKit runtime test reports (13 failed, 1 skipped
in the last run). The engine is the limitation here, and **Safari remains
unverified** until it is measured on a real device — the Playwright build is not
evidence either way for shipped Safari. The probe worker is a test fixture in
`e2e/fixtures/`, served by route interception so it never ships.

### The size gate measured an artifact nobody downloads

`check-agent-size.mjs` measured the raw `wasm32` cargo artifact against 5 MiB.
That file carries 2.75 MiB of `.debug_*` and `name` sections that `wasm-opt`
strips, so it read as a failure (8.39 MiB) while the shipped bundle was well
inside its budget. The gate now measures the artifact the browser fetches,
`apps/web/public/agent-runtime/`, against the unchanged production ceilings
(1,200,000 gzip wasm, 60,000 gzip glue), asserts the shipped wasm carries no
debug or `name` metadata, and CI runs it after `build:agent-runtime`. Measured:

```
agent core (browser, shipped): 3,050,320 raw / 966,846 gzip (budget 1,200,000) — ok
agent glue (browser, shipped):    97,931 raw /  14,139 gzip (budget    60,000) — ok
browser runtime total: 980,985 gzip (958 KiB)
```

## Acceptance matrix

| Area | Result |
|---|---|
| Chromium agent turn | Pass |
| Firefox agent turn | Pass |
| Mock provider invocation | Pass |
| Assistant delta propagation | Pass |
| Turn completion | Pass |
| Error propagation (typed code, settles as error) | Pass |
| Cancellation (`interrupted`, settles as stopped) | Pass |
| Five defect regressions | Pass |
| FTS5 semantics (real SQLite: MATCH, update, delete, rebuild, idempotent) | Pass, native |
| FTS5 present in the Wasm engine | Pass, worker probe |
| FTS5 `search()`/`rebuildSearchIndex()` | Pass — worker-hosted store; `browser-store.spec.ts` 8/8 on Chromium and Firefox |
| Database close/reopen (session store, new worker) | Pass |
| Page reload persistence | Pass |
| Encryption-key integrity | Pass |
| Playwright WebKit OPFS | Documented environment limitation |
| Production bundle | Pass — 958 KiB gzip total |

## Chunk 6 — session relay

`services/cowork-api` now relays agent sessions into `AGENT_DB`: migration
`0006_agent_sessions.sql` adds `agent_sessions`, `agent_session_leases` and
`agent_session_events`. The wire shapes are the Chunk 1 contracts, not copies.

Evidence, all from the suite rather than reading code:

- **cowork-api: 96 tests pass**, 8 of them in `tests/session-sync.test.ts` —
  one holder at a time (`lease_held`), a fence that advances across holders,
  retry answered `duplicate`, stale fence answering `stale` and writing nothing,
  checksum mismatch refused `invalid_request`, ordered pull with a cursor,
  hard delete plus tombstone (`session_deleted` afterwards), user and workspace
  scoping, a holder-only command refused with 422, and the quota boundary.
- **contracts: 83 tests pass**, including the lease envelope added to
  `fixtures/session-sync.json` and a fence check that rejects zero.
- **Rust parity: 11 tests pass**, including
  `session_lease_fixture_matches_the_contract`, so the lease is one shape in
  three places.
- **Gates:** `verify-port-specs` 0 failures, `verify-schema-catalog` 0 broken
  files, `check-docs` ok, both typechecks clean.

The relay refuses a stale writer rather than merging, so a device that lost its
lease must re-lease and reload; there is no conflict merge.

**Not implemented by Chunk 6, despite the relay supporting the protocol:**
automatic sync scheduling, reconnection and offline-recovery wiring, device
discovery/management UI, local projection reconciliation, a user-facing
ownership handoff, and any sync-status surface. Device registration and
revocation already exist in `sync_devices`, but session sync does not require a
registered device. The client side is Chunk 7; the browser sync store moving
into a worker is #19.

## Chunk 7 — client wiring (in progress)

What landed, each with tests:

- **Relay client and sync pass** (`@edapex/host/sync`): contract-validated
  responses, typed failures including `transport_unavailable`, lease reuse and
  mid-pass renewal, push-then-pull with cursor written only after application,
  one retry after a takeover, tombstone handling. 14 tests.
- **Browser store in a dedicated worker** (#19): `worker/store.worker.ts` owns
  OPFS SQLite; `lib/browser-store.ts` is the async page handle. The spec that had
  been failing 2 of 4 now passes 8/8 on Chromium and a new `store-firefox`
  project, covering search, rebuild, atomic write and reload.
- **Both transports**: `createFetchTransport` (cookies, no token) and
  `createInvokeTransport` over the new Rust `relay_request` command, which is
  path-scoped to the relay and returns the status the client branches on. Path
  guard asserted in Rust; wire behaviour asserted in TypeScript.
- **Deletion across devices**: a push that answers `session_deleted` stops
  pushing and lets the pull deliver the tombstone, so the deletion is applied
  rather than lost. Local resurrection refusal is required by the store contract
  and already enforced by `crates/store`'s `reject_deleted_session`.
- **Snapshot routing**: `splitEvents` keeps `projection` (transcript),
  `core_snapshot` (model context) and `deletion` (tombstone) apart, so a host
  cannot apply model context to the transcript.

Still open in Chunk 7: hosts persisting pulled snapshots into their conversation
stores, automatic scheduling, reconnection/offline recovery and sync status.
Those remain deferred, not implied.

## Reproduce

```bash
cargo test -p edapex-agent -p edapex-store
cargo test -p edapex-desktop
cargo build --target wasm32-unknown-unknown -p edapex-agent-wasm
pnpm --dir apps/web run build:agent-runtime
node scripts/check-agent-size.mjs
pnpm --dir apps/web exec vitest run --root ../../packages/contracts tests/session.test.ts
pnpm --dir apps/web run check
pnpm --dir apps/web exec vitest run --root ../../packages/host   # 20 tests
cargo test -p edapex-desktop --lib                               # relay path guard
pnpm --dir apps/web exec playwright test --project=chromium --project=store-firefox browser-store.spec.ts
pnpm --dir apps/web exec playwright test --project=infinity-chromium --project=infinity-firefox
```

Engines exercised: Chromium 158.0.8127.18, Firefox 159.0, Playwright WebKit 27.2.
The browser command excludes the WebKit project on purpose: `infinity-opfs-probe`
shows that Playwright's WebKit cannot create an OPFS sync access handle, so its
suite fails for the engine's reason, not the runtime's. Safari is unverified.
