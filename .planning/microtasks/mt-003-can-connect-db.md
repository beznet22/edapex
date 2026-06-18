# Microtask mt-003 — canConnectDb.ts

## Goal
Provide a synchronous-feeling boolean `canConnectDb()` that probes the live MySQL connection at test startup. Used by `describe.skipIf(...)` guards so the integration test suite gracefully skips when DB is unreachable (e.g., CI without MySQL).

## Scope (files to READ)
- `src/lib/server/db/index.ts` (getDatabase)
- `.env` (DATABASE_URL only — never log it)

## Scope (NOT to read)
- Do NOT read any test file
- Do NOT read any source file under `src/` other than `db/index.ts`

## Outputs (files to WRITE)
- `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`

## Constraints
- TypeScript strict: no `any`
- Export `canConnectDb(): Promise<boolean>` — returns `true` if a `SELECT 1` query succeeds within 3 seconds, `false` otherwise
- Cache the result: subsequent calls within the same process return the cached value (so we don't hammer the DB on every `describe.skipIf` evaluation)
- Catch all errors and return `false` (never throw)
- Use `mysql2/promise` directly (NOT the Drizzle wrapper) for the probe — keeps the helper decoupled from Drizzle schema
- No logging on success; on failure, `console.warn` once with a sanitized message ("DB unreachable for integration tests; skipping.")

## Estimated LOC
~60 lines

## Definition of Done
- File exists at `tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/mastra/integration-helpers/canConnectDb.ts`
- Sanity test: call `await canConnectDb()` against the live `devdb` and confirm it returns `true`. Then temporarily set `DATABASE_URL` to an unreachable host and confirm it returns `false` without throwing.
- Write a one-page summary to `.planning/results/mt-003.md`