# Microtask mt-002 — mysqlFactCheck.ts

## Goal
Create a typed wrapper around raw `mysql` CLI invocations for fact-checking assertions in integration tests. Provides `runMysql<T>(sql, params): Promise<T[]>` and a single-row variant `runMysqlOne<T>(sql, params): Promise<T | null>`.

## Scope (files to READ)
- `node:child_process` (execFile)
- `.env` (DATABASE_URL — but only for parsing host/user/db; do not log the password)
- `node:url` (for parsing the mysql:// connection string)

## Scope (NOT to read)
- Do NOT read any source file under `src/`
- Do NOT read any other helper file

## Outputs (files to WRITE)
- `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`

## Constraints
- TypeScript strict: no `any`
- NEVER log the password. Build the `mysql` CLI args as `["-h", host, "-u", user, "-p" + password, "-D", db, "-N", "-B", "-e", sql]`. The `-p<password>` form is fine for non-interactive CLI but the password must not appear in any `console.log`.
- Use `child_process.execFile` (NOT `exec`) to avoid shell-injection
- Parse tab-separated output (use `-N -B` flags for batch, no headers)
- Parse params: `?` placeholders replaced with quoted values (escape single quotes by doubling them)
- Return typed result based on a generic `T extends Record<string, unknown>`
- Add a 5-second timeout to prevent hangs
- Export two functions:
  - `runMysql<T>(sql: string, params?: unknown[]): Promise<T[]>`
  - `runMysqlOne<T>(sql: string, params?: unknown[]): Promise<T | null>`

## Estimated LOC
~120 lines

## Definition of Done
- File exists at `tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- File passes `pnpm run check` with zero errors
- File passes `pnpm run lint tests/lib/server/mastra/integration-helpers/mysqlFactCheck.ts`
- Sanity test: call `runMysqlOne<{c: string}>("SELECT COUNT(*) AS c FROM sm_students WHERE id = ?", [1])` and confirm it returns `{c: "881"}` (or whatever the real count is — check with `mysql -e` first if uncertain)
- Write a one-page summary to `.planning/results/mt-002.md`