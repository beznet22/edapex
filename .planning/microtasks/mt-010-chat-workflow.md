# Microtask mt-010 — chatWorkflow integration test

## Goal
Write integration tests for `chatWorkflow` exercising the end-to-end flow against the real DB. Verify (a) parallel `titleStep` + `assistantStep` both run, (b) `selectionGateStep` suspend/resume cycle, (c) error propagation when assistant agent is missing, (d) libSQL mastra memory persists thread titles.

## Scope (files to READ)
- `src/lib/server/mastra/workflows/chat.ts` (read this file carefully — focus on `chatWorkflow`, `titleStep`, `assistantStep`, `selectionGateStep`, `continuationAssistantStep`)
- `src/lib/server/mastra/agents/assistant.ts` — ONLY to understand the agent's `stream()` signature
- `src/lib/server/mastra/index.ts` — ONLY for `mastra.getWorkflow(...)` and `mastra.getAgent(...)` access
- `src/lib/server/mastra/storage/libsql/mastra-storage.ts` — ONLY for the libSQL storage config (to understand where thread titles are written)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- `src/lib/server/mastra/tenant-context.ts` — ONLY for `createTenantContext`
- `node_modules/@mastra/core/dist/request-context.d.ts` (or similar) — for the `RequestContext` import path

## Scope (NOT to read)
- Do NOT read any other workflow, tool, service, or repository file
- Do NOT modify any helper, src/, or workflow file

## Outputs (files to WRITE)
- `tests/lib/server/mastra/workflows/chat.integration.test.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`. Use `withTenantFixture`. No mocks except for the LLM (since we can't call real DeepSeek/OpenAI in CI).
- `describe.skipIf(!await canConnectDb())` at the top level
- Mock the LLM to avoid network calls: use `vi.mock("@mastra/core/llm", () => ({ ... }))` OR mock `mastra.getAgent('assistant').stream(...)` to return a stub stream object that emits a single `text` chunk.
- Test cases (minimum):
  1. **Happy path**: run `chatWorkflow` with a simple prompt → workflow completes with `status: 'success'`, output `text` is non-empty, `titleStep` writes a thread title to libSQL mastra memory (verify via `fx.mysql<{c: string}>("SELECT COUNT(*) AS c FROM mastra_threads WHERE id=?", ["test-thread-XYZ"])` where the libSQL file is at `tests/.tmp/test.db`)
  2. **Selection gate suspend**: set `pendingSelection` on requestContext → `selectionGateStep` calls `suspend()` with the option list. Use `run.start({ suspendHandler })` or whatever the current Mastra workflow API exposes (verify against `node_modules/@mastra/core/dist/workflows/workflow.d.ts`).
  3. **Selection gate resume**: pass `resumeData: { selectedOptionId: 'opt_1' }` → `continuationAssistantStep` fires with the selected option
  4. **Error propagation**: pass an empty `requestContext` and force the assistant agent lookup to throw → workflow's `onError` hook fires with the error message (use a mock `mastra.getAgent` that returns `undefined`)
  5. **No-op selection gate**: no `pendingSelection` on requestContext → `selectionGateStep` returns `{ selectedOptionId: null, contextKey: null }` and `continuationAssistantStep` returns `{ text: '' }`
- Use `mastra.getWorkflow("chatWorkflow").createRunAsync()` (or `.createRun()` depending on installed Mastra version) to instantiate runs
- Use a `WritableStream` mock for the writer that collects chunks into an array (so we can assert `data-threadTitle`, `data-usage`, etc. were emitted)
- Use sandboxed thread IDs like `test-thread-${Date.now()}` to avoid collision with real data

## Estimated LOC
~450 lines

## Definition of Done
- File exists at `tests/lib/server/mastra/workflows/chat.integration.test.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/mastra/workflows/chat.integration.test.ts`
- `pnpm test:integration tests/lib/server/mastra/workflows/chat.integration.test.ts` runs all tests green
- No permanent changes to libSQL mastra memory (tests use sandboxed thread IDs; verify with `sqlite3 tests/.tmp/test.db "SELECT COUNT(*) FROM mastra_threads WHERE resource_id LIKE 'test-thread-%'"` after)
- Write a one-page summary to `.planning/results/mt-010-chat-workflow.md`