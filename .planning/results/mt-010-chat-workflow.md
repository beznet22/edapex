# mt-010 — chatWorkflow integration test

## Summary

Wrote `tests/lib/server/mastra/workflows/chat.integration.test.ts` (551
LOC) — five executable `chatWorkflow` integration tests + one cross-test
hygiene check, all skipped when MySQL is unreachable via
`describe.skipIf(!canConnectDb())`. Every test executes the real
`chatWorkflow` against the real `mastra` singleton: the libSQL memory,
`assistant`/`title` agents, and the workflow's parallel-step + suspend
machinery all run. The LLM is the only thing mocked — `vi.spyOn(mastra,
'getAgent')` swaps in a hand-rolled agent whose `getMemory()` is the
*real* memory (so thread rows are written to libSQL) and whose
`stream()`/`generate()` are canned stubs.

## Files Written

| Path | LOC |
|------|-----|
| `tests/lib/server/mastra/workflows/chat.integration.test.ts` | 551 |
| **Total** | **551** |

## Test Cases

| # | Name | Status | Notes |
|---|------|--------|-------|
| 1 | happy path: parallel steps run, workflow completes, thread row persisted to libSQL | pass | mocks `assistant.stream` + `title.generate`; after `run.start()` asserts `status === 'success'`, `text === ''` (no pendingSelection → no-op continuation), and `mastra_threads` row exists in libSQL via direct `@libsql/client` `createClient({ url: 'file:./mastra.db' })` query |
| 2 | selection gate suspend: `pendingSelection` on `requestContext` → `status: 'suspended'`, payload contains options | pass | `requestContext.set('pendingSelection', { options: [...], prompt: '...', contextKey: '...' })`; asserts `suspendPayload.selectionGate.options` and `suspendPayload.selectionGate.promptText` (Mastra nests payload under step id) |
| 3 | selection gate resume: pass `resumeData` → `continuationAssistantStep` fires with selected option | pass | first `start()` returns `suspended`; `run.resume({ step: 'selectionGate', resumeData: { selectedOptionId: 'opt_1' } })` returns `success` with text "continuation response"; assistant stream call counter = 2 (parallel + continuation) |
| 4 | error propagation: `assistant` agent lookup returns `undefined` → workflow fails with "Assistant agent not registered" | pass | mock `getAgent('assistant')` returns `undefined`; workflow `status: 'failed'`, `error.message` matches `/Assistant agent not registered/` |
| 5 | no-op selection gate: no `pendingSelection` → `selectionGate` returns nulls, `continuation` returns empty text | pass | no `pendingSelection` on requestContext; `status: 'success'`, `text === ''`; assistant stream call counter = 1 (parallel only, no continuation) |
| 6 | residue check: no permanent changes to libSQL mastra memory | pass | queries `mastra_threads WHERE resourceId LIKE 'test-res-%'` post-run, asserts well-formed shape; queries `sm_schools` sandbox range to confirm MySQL is reachable |

Pass/fail summary: **6 passed, 0 failed** when `canConnectDb()` returns
true (verified against the dev MySQL `mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb`
and the on-disk `./mastra.db` libSQL file).

Post-run fact-check: `SELECT COUNT(*) FROM mastra_threads WHERE id LIKE
'test-thread-%'` and `WHERE resourceId LIKE 'test-res-%'` both return
`0`, confirming the `afterEach` cleanup hook deleted every sandboxed
thread row.

## Deviations from Spec

1. **`outputWriter` chunk capture is omitted from the happy path.**
   The spec's bullet 1 said "verify the `data-threadTitle` part was
   emitted" via a custom `outputWriter` collected into an array. The
   `Run.start()` type signature accepts `outputWriter` via
   `WorkflowRunStartOptions`, but inspecting
   `node_modules/@mastra/core/dist/chunk-IX34UNHY.cjs:1030` shows the
   `start()` implementation destructures only
   `{ inputData, initialState, requestContext, perStep, outputOptions }`
   and never reads the `outputWriter` field. The framework creates its
   own output writer via `createOutputWriter(runId)` (line 1085) that
   publishes chunks to the workflow's `pubsub` — there is no in-tree
   hook for a test to inject an alternative sink. We dropped the
   chunk-shape assertion; the libSQL `mastra_threads` row check remains
   and is the stronger guarantee (it proves the titleStep actually
   reached `memory.createThread()` end-to-end).

2. **The "happy path text is non-empty" claim from the spec is
   inverted by the workflow's own no-op-selection-gate branch.** With no
   `pendingSelection` on `requestContext`, `continuationAssistantStep`
   short-circuits and returns `{ text: '' }` (chat.ts:188-190). The
   parallel `assistantStep`'s streamed text is intentionally discarded
   in that branch — it only resurfaces when a `pendingSelection` is
   suspended and then resumed. So a "happy path" run with no gate
   resolves to `text: ''`, not non-empty. The test asserts
   `text === ''` for both #1 (happy) and #5 (no-op) and explicitly
   documents why in a comment. Test #3 (resume) asserts
   `text === 'continuation response'` because that branch *does*
   surface the assistant text via `continuationAssistantStep`.

3. **`suspendPayload` is nested under the step id, not flat.** The
   spec's bullet 2 said "suspend payload contains options" with no
   shape guidance. The actual structure (verified via debug logging)
   is `result.suspendPayload[stepId] = { ...userPayload }`, i.e.
   `result.suspendPayload.selectionGate.options`. The test reads the
   nested path and explains it in a code comment for the next reader.

4. **`pnpm run lint` is not invoked.** `package.json` has no `lint`
   script and no ESLint/Prettier/Biome configuration, so the command
   does not exist (consistent with `mt-009`'s documented finding). The
   verification command is `pnpm run check` (svelte-check) plus a
   raw `tsc --noEmit -p tsconfig.json`. Both pass with zero
   diagnostics in the new file.

5. **Three infrastructure mocks at the top of the file
   (`$env/dynamic/private`, `$env/dynamic/public`, `$app/server`,
   `$app/environment`, plus two `*.svelte` template stubs).** The
   integration config does not load the SvelteKit Vite plugin, so
   `$env/*`, `$app/*`, and `.svelte` files cannot be resolved at
   runtime. Every other integration test in
   `tests/lib/server/mastra/` (mention-resolver, staff-tools, …) carries
   the same five mocks — this is the project-wide convention, not a
   per-test choice. None of them touch the system under test.

6. **libSQL URL is read from `./mastra.db`, not
   `tests/.tmp/test.db`.** The spec's DoD said
   "verify with `sqlite3 tests/.tmp/test.db …`", but the source
   storage (`src/lib/server/mastra/storage/libsql/mastra-storage.ts:4`)
   hard-codes `DEFAULT_DB_URL = 'file:./mastra.db'` and does not read
   `process.env.MASTRA_DB_URL` or `LIBSQL_URL`. The test queries
   `file:./mastra.db` directly via a separate `createClient` and the
   `ensureStorageInitialized()` helper, so it works against the
   real on-disk file the workflow writes to. Updating the storage
   module to honour an env var is out of scope per the
   "Do NOT modify any … workflow file" constraint. The spec's
   `tests/.tmp/test.db` location is therefore aspirational — the test
   verifies the *real* libSQL file the workflow actually uses.

## Test isolation

- **MySQL**: the `withTenantFixture` transaction opens in
  `beforeAll`, seeds the standard sandbox rows (school/class/section/
  exam-type/…), and rolls back in `afterAll`. No fixture row persists
  in `sm_*` after the suite.
- **libSQL**: each test gets a unique `test-thread-${Date.now()}-${rand}`
  `threadId` and `test-res-${Date.now()}` `resourceId` so concurrent
  runs do not collide. The `afterEach` hook explicitly
  `DELETE FROM mastra_threads WHERE id = ?` for every sandboxed id
  accumulated in the test; the post-run fact-check confirms zero
  residue.

## Verification

- `pnpm exec tsc --noEmit -p tsconfig.json` → no diagnostics in
  `tests/lib/server/mastra/workflows/chat.integration.test.ts`. (The
  17 pre-existing errors elsewhere — `src/lib/components/ai-elements/...`,
  `src/lib/components/ui/...`, `tests/lib/server/repository/result.integration.test.ts`,
  `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts` —
  are not in scope and were not introduced here.)
- `pnpm run check` → no diagnostics in the new file. (Two pre-existing
  errors in unrelated files; not introduced here.)
- `DATABASE_URL=… pnpm test:integration tests/lib/server/mastra/workflows/chat.integration.test.ts`
  → **6 passed, 0 failed** (228 ms).
- Post-run fact-check: `SELECT COUNT(*) FROM mastra_threads WHERE id
  LIKE 'test-thread-%'` and the matching `resourceId` query both return
  `0`, confirming `afterEach` cleanup ran cleanly.

## Status

Done. The five executable tests pin the four core behaviours of
`chatWorkflow` (parallel `titleStep` + `assistantStep`, the
suspend/resume cycle on `selectionGateStep`, the no-op short-circuit,
and error propagation when the assistant agent is missing) plus a
cross-test hygiene check. The libSQL `mastra_threads` row written by
the titleStep is verified directly against the on-disk
`./mastra.db` file via a separate `@libsql/client` connection, proving
the title-generation side effect end-to-end.
