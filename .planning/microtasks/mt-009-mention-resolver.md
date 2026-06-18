# Microtask mt-009 — mention-resolver integration test

## Goal
Write integration tests for `resolveMentionsInMarkdown` (called by `editorCommandWorkflow.resolveMentionsStep`). Pin the current direct-DB pattern as a regression net for the future refactor to `ScopedRepositoryProvider`.

## Scope (files to READ)
- `src/lib/server/mastra/editor/mention-resolver.ts` (read this file carefully — note that it uses `getDatabase()` directly, NOT a provider)
- `tests/lib/server/mastra/integration-helpers/withTenantFixture.ts`
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- `src/lib/server/mastra/tenant-context.ts` — ONLY for the `WorkspaceMismatchError` import
- `src/lib/server/db/sms-schema.ts` — ONLY for `sm_students` shape

## Scope (NOT to read)
- Do NOT read any other tool, agent, workflow, repository, or service file
- Do NOT modify any helper, src/, or workflow file

## Outputs (files to WRITE)
- `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`

## Constraints
- TypeScript strict: no `any`, no `@ts-ignore`. Use `withTenantFixture`. No mocks.
- `describe.skipIf(!await canConnectDb())` at the top level
- The function under test uses `requestContext.get('tenantContext')` to read the tenant. Build the request context manually in each test:
  ```ts
  import { RequestContext } from '@mastra/core/request-context';
  const rc = new RequestContext();
  rc.set('tenantContext', fx.tenant);
  ```
- Test cases (minimum):
  1. **Student mention resolved**: input `"Hello {{students:9999007}}"`, expected output `"Hello <<Alice Smith (Adm#9999007) (students#9999007)>>"`, expected `mentions: [{ category: 'students', id: 9999007, label: '...' }]`
  2. **Multiple mentions** in one input → all resolved
  3. **Date mention**: `"Date {{date:2025-01-15}}"` → `"Date <<2025-01-15 (date)>>"`
  4. **Custom mention**: `"Note {{custom:foo bar}}"` → `"Note <<foo bar (custom)>>"`
  5. **Cross-tenant rejection (critical)**: `{{students:<id-from-other-school>}}` throws `WorkspaceMismatchError`
  6. **Unknown student id**: `{{students:9999999}}` (non-existent) throws `WorkspaceMismatchError`
  7. **No requestContext**: returns `{ markdown: <unchanged>, mentions: [] }`
  8. **Dedupe of identical mentions**: `{{students:9999007}} {{students:9999007}}` — both occurrences replaced (note: current code has a bug at line 102-106 where dedup is inverted — log this finding in the result file but DO NOT fix it; the test pin documents current behavior)
- Each test should use the real student fixture inserted by `withTenantFixture`
- Note the inverted dedup bug at lines 102-106 and document it in `.planning/results/mt-009-mention-resolver.md`

## Estimated LOC
~350 lines

## Definition of Done
- File exists at `tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/mastra/editor/mention-resolver.integration.test.ts`
- `pnpm test:integration tests/lib/server/mastra/editor/mention-resolver.integration.test.ts` runs all tests green (except the dedup-bug test, which should be marked `it.skip` with a comment explaining the known bug)
- All sandboxed fixtures are cleaned up
- Write a one-page summary to `.planning/results/mt-009-mention-resolver.md` including the inverted-dedup bug note