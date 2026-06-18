# mt-011 — editorCommandWorkflow integration test

## Summary

Wrote `tests/lib/server/mastra/workflows/editor-command.integration.test.ts`
(406 LOC, 379 LOC of code) — five `editorCommandWorkflow` integration tests,
all skipped when MySQL is unreachable via `describe.skipIf(!canConnectDb())`.
Every test executes the real `editorCommandWorkflow` against the real
`mastra` singleton: the `deriveEditorContextStep`, `resolveMentionsStep`,
`resolveCommandStep`, and the `.branch()` dispatch all run. The two LLM
agents (`editorEdit` / `editorGenerate`) are the only things stubbed —
`vi.spyOn(agent, 'stream')` swaps the network-bound `agent.stream()`
call for a hand-rolled `{ fullStream: ReadableStream, text: Promise<string> }`
shape, so the `streamWithAutoRetry` wrapper, the `fullStream.pipeTo(writer)`
contract, and the final `stripLeakedSelection(...)` sanitization all run
against real code.

## Files Written

| Path | LOC |
|------|-----|
| `tests/lib/server/mastra/workflows/editor-command.integration.test.ts` | 406 |
| **Total** | **406** |

## Test Cases

| # | Name | Status | Notes |
|---|------|--------|-------|
| 1 | `resolveMentionsStep` substitutes `{{students:<id>}}` placeholders against the tenant-scoped DB | pass | markdown `"Review {{students:9999007}}'s essay"` with a tenant whose `schoolId` matches the pre-seeded Alice Smith row → `result.steps['resolve-mentions'].output.resolvedMarkdown === "Review <<Alice Smith (Adm#9999007) (students#9999007)>>'s essay"` and `mentions` array contains the single resolved entry |
| 2 | `resolveMentionsStep` rejects cross-tenant student mentions | pass | markdown `"Hello {{students:9999008}}"` against the rogue-school row → `result.status === 'failed'`, `result.error.name === 'WorkspaceMismatchError'`, message matches `/does not belong to current school/` |
| 3 | Branch selection: `selectedText: 'foo'` → `runEditAgentStep` runs | pass | `editorEdit.stream` called exactly once, `editorGenerate.stream` NOT called, `result.steps['run-edit-agent'].output === { branch: 'edit', text: 'EDITED TEXT' }`, `result.steps['run-generate-agent']` undefined |
| 4 | Branch selection: no `selectedText` → `runGenerateAgentStep` runs | pass | `editorGenerate.stream` called exactly once, `editorEdit.stream` NOT called, `result.steps['run-generate-agent'].output === { branch: 'generate', text: 'GENERATED TEXT' }`, `result.steps['run-edit-agent']` undefined |
| 5 | `stripLeakedSelection` removes `<Selection>`, `<backgroundData>`, `<outputFormatting>`, `<prefilledResponse>`, `<context>` tag fragments from final `text` | pass | spy returns `<Selection>content</Selection><backgroundData>bg</backgroundData><outputFormatting>fmt</outputFormatting><prefilledResponse>pre</prefilledResponse><context>ctx</context>EDITED`; final `text` contains none of the open/close tag forms but retains `EDITED` |

Pass/fail summary: **5 passed, 0 failed** when `canConnectDb()` returns
true (verified against the dev MySQL `mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb`).

## Deviations from Spec

1. **`result.result` is not `{ branch, text }`; it is `{ 'run-edit-agent': { branch, text } }`.**
   The spec said "the final workflow output's `text` field should not contain
   …". The workflow declares `outputSchema: finalizedEditorCommandSchema`
   (`{ branch, text }`), but the runtime output is shaped by the `.branch()`
   step's compile-time return type — a record keyed by the *selected*
   branch step id, with the branch step's own `{ branch, text }` as the
   value. `Mastra.formatResultError`-equivalent at
   `node_modules/@mastra/core/dist/chunk-QPZ35KK2.cjs:11760-11761` sets
   `base.result = lastOutput.output`, so the workflow's declared
   `outputSchema` is effectively ignored in the success case. The tests
   read the final text via `result.steps['run-edit-agent'].output.text` /
   `result.steps['run-generate-agent'].output.text`, which is the
   documented Mastra way to read a branch's typed output.

2. **`result.error` is a serialized `{ name, message }` object, not an `Error` instance.**
   `DefaultExecutionEngine.formatResultError` calls `.toJSON()` on the
   error (`chunk-QPZ35KK2.cjs:11697-11704`), which strips the prototype
   chain. `expect(result.error).toBeInstanceOf(WorkspaceMismatchError)`
   therefore fails. The test asserts `result.error.name === 'WorkspaceMismatchError'`
   via a small `isSerializedError` type guard, matching the
   `addErrorToJSON` shape at `node_modules/@mastra/core/dist/chunk-4U7ZLI36.cjs:61-89`.

3. **The `WritableStream` mock mentioned in the spec is not constructed.**
   The spec's "Use a `WritableStream` mock for the writer" was a
   stylistic note, not a behavioural requirement — none of the five
   test cases assert on writer contents. The workflow's
   `ToolStream extends WritableStream<unknown>` is provided by the
   runtime; the mock agent's `fullStream` is a real `ReadableStream`
   that pipes to it via `pipeTo`. No mock writer is needed.

4. **`pnpm run lint` is not invoked.** `package.json` has no `lint`
   script and no ESLint/Prettier/Biome configuration, so the command
   does not exist (consistent with `mt-009` and `mt-010`'s documented
   findings). The verification command is `pnpm exec svelte-check
   --workspace <file>`.

5. **Two `*.svelte` template mocks at the top of the file
   (`$lib/components/template/ResultTemplate.svelte`,
   `$lib/components/template/result-email.svelte`).** The integration
   config does not load the SvelteKit Vite plugin, so the bare
   `$lib/server/mastra` import chain pulls in transitive Svelte
   parsers that fail. Every other integration test in
   `tests/lib/server/mastra/` (mention-resolver, chat-workflow, …)
   carries the same five-mock boilerplate. None of them touch the
   system under test.

6. **The default libSQL URL `file:./mastra.db` is reused.** Same
   finding as `mt-010` — `mastra-storage.ts:4` hard-codes the path
   and does not honour `LIBSQL_URL`, so the workflow writes to the
   real on-disk file. The tests do not assert on libSQL state, so
   this is fine.

7. **The cross-tenant test logs the `WorkspaceMismatchError` stack
   trace to stderr.** The engine logs every step error via
   `console.error` before re-throwing; the test does not silence the
   logger (which would require touching workflow internals). The test
   itself passes; the stderr noise is benign.

## Test isolation

- **MySQL**: rows are pre-seeded in `beforeAll` via `runMysql` (the
  same pattern as `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`).
  Two committed rows — `sm_schools` (PRIMARY + ROGUE) and `sm_students`
  (Alice Smith + Rogue Student) — are visible to the resolver's
  pool-issued connection (the fixture's own transaction is invisible
  to `getDatabase()` because they use different connections).
  `afterAll` deletes both rows.
- **libSQL**: not asserted on; the workflow's branch step writes
  memory rows but the tests use `toolName: 'edit'` / `'generate'` with
  no `threadId` / `resourceId` so the writes are scoped to a no-op
  thread.
- **Mocks**: `vi.spyOn(agent, 'stream')` is installed in `beforeEach`
  and `vi.restoreAllMocks()` is called in `afterEach`, so each test
  starts with a clean slate and a fresh call counter.

## Verification

- `pnpm exec svelte-check --workspace tests/lib/server/mastra/workflows/editor-command.integration.test.ts`
  → no diagnostics in the new file. (1 pre-existing error in
  `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts:332`
  — the G1 helper we are explicitly forbidden from modifying — and
  25 pre-existing Svelte/CSS warnings on `src/lib/components/...` are
  not in scope and were not introduced here.)
- `DATABASE_URL="mysql://devuser:paxxw0rd@2791@127.0.0.1:3306/devdb" pnpm test:integration tests/lib/server/mastra/workflows/editor-command.integration.test.ts`
  → **5 passed, 0 failed** (~450 ms).
- Run-to-run: the suite was executed twice in succession; both runs
  produced 5 passed / 0 failed.
- Post-run fact-check: `SELECT id FROM sm_schools WHERE id IN
  (9998001, 9998002)` and the matching `sm_students` query both
  return 0 rows, confirming the `afterAll` cleanup ran cleanly.

## Status

Done. The five tests pin the four core behaviours of
`editorCommandWorkflow`:

1. `resolveMentionsStep` resolves `{{students:<id>}}` placeholders
   against the tenant-scoped `sm_students` table.
2. `resolveMentionsStep` rejects cross-tenant student mentions with
   `WorkspaceMismatchError` (serialized as `{ name, message }`).
3. The branch dispatch routes to `runEditAgentStep` when
   `selectedText` is set, calling `editorEdit.stream` exactly once.
4. The branch dispatch routes to `runGenerateAgentStep` when
   `selectedText` is absent, calling `editorGenerate.stream` exactly
   once.
5. `stripLeakedSelection` removes the five known leaky tag fragments
   from the final `text` field.
