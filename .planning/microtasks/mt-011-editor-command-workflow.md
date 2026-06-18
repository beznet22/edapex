# Microtask mt-011 — editorCommandWorkflow integration test

## Goal
Write integration tests for `editorCommandWorkflow` exercising the `resolveMentionsStep` SQL path (the only step that directly touches the DB) and verifying branch selection between `runEditAgentStep` (selected text present) and `runGenerateAgentStep` (no selection).

## Scope (files to READ)
- `src/lib/server/mastra/workflows/editor-command.ts` (read this file carefully — focus on `editorCommandWorkflow`, `deriveEditorContextStep`, `resolveMentionsStep`, `resolveCommandStep`, `runEditAgentStep`, `runGenerateAgentStep`)
- `src/lib/server/mastra/editor/mention-resolver.ts` (the function called by `resolveMentionsStep`)
- `src/lib/server/mastra/editor/schemas.ts` — for `editorCommandRequestSchema`, `derivedEditorCommandSchema`, `resolvedMentionsSchema`, `resolvedEditorCommandSchema`, `editorCommandResultSchema`, `finalizedEditorCommandSchema`
- `src/lib/server/mastra/agents/editor-edit.ts` and `src/lib/server/mastra/agents/editor-generate.ts` — ONLY to understand the agent's `stream()` signature for mocking
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- `node_modules/@mastra/core/dist/request-context.d.ts` — for the `RequestContext` import path

## Scope (NOT to read)
- Do NOT read any other workflow, tool, service, or repository file
- Do NOT modify any helper, src/, or workflow file

## Outputs (files to WRITE)
- `tests/lib/server/mastra/workflows/editor-command.integration.test.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`. Use `withTenantFixture`. No mocks except for the LLM.
- `describe.skipIf(!await canConnectDb())` at the top level
- Mock the LLM-driven agents to avoid network calls: stub `mastra.getAgent('editorEdit').stream(...)` and `mastra.getAgent('editorGenerate').stream(...)` to return a `{ fullStream, text: Promise.resolve('EDITED TEXT'), fullStream: { pipeTo: async () => {} } }` shape
- Test cases (minimum):
  1. **resolveMentionsStep substitutes student names**: input markdown `"Review {{students:9999007}}'s essay"` with `requestContext` containing tenant → output markdown contains `"Alice Smith (Adm#9999007) (students#9999007)"` and `mentions` array contains the resolved entry
  2. **resolveMentionsStep cross-tenant rejection**: input markdown `"{{students:<id-from-other-school>}}"` with tenant-A → `resolveMentionsStep` throws `WorkspaceMismatchError`
  3. **Branch selection — edit**: input has `selectedText: "foo"` → `runEditAgentStep` runs (verify via mocked agent call count: `editorEdit.stream` called once, `editorGenerate.stream` NOT called)
  4. **Branch selection — generate**: input has empty/no `selectedText` → `runGenerateAgentStep` runs (verify inverse of above)
  5. **stripLeakedSelection**: the final workflow output's `text` field should not contain `<Selection>`, `<backgroundData>`, `<outputFormatting>`, `<prefilledResponse>`, or `<context>` tags even if the stub agent emits them
- Use `mastra.getWorkflow("editorCommandWorkflow").createRunAsync()` (or `.createRun()`)
- Use a `WritableStream` mock for the writer
- The `resolveMentionsStep` test should use real student fixtures from `withTenantFixture`

## Estimated LOC
~400 lines

## Definition of Done
- File exists at `tests/lib/server/mastra/workflows/editor-command.integration.test.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/mastra/workflows/editor-command.integration.test.ts`
- `pnpm test:integration tests/lib/server/mastra/workflows/editor-command.integration.test.ts` runs all tests green
- All sandboxed fixtures are cleaned up
- Write a one-page summary to `.planning/results/mt-011-editor-command-workflow.md`