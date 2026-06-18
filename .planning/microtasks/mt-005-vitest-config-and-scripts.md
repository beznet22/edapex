# Microtask mt-005 — vitest integration config + package.json scripts

## Goal
Create a separate vitest config that picks up only `*.integration.test.ts` files, with a longer timeout and the same path aliases as the main config. Add two scripts to `package.json`: `test:integration` and `test:all`.

## Scope (files to READ)
- `vitest.config.ts` (current main config)
- `package.json` (current scripts block)

## Scope (NOT to read)
- Do NOT read any source file
- Do NOT read any test file

## Outputs (files to WRITE/EDIT)
- WRITE: `vitest.integration.config.ts` (new file)
- EDIT: `package.json` — add two scripts inside the existing `"scripts"` block:
  - `"test:integration": "DATABASE_URL=\"$DATABASE_URL\" vitest run --config vitest.integration.config.ts"`
  - `"test:all": "pnpm test && pnpm test:integration"`
- ADD TO `.gitignore`: `.planning/claims/` (transient claim locks)

## Constraints
- TypeScript strict
- The new vitest config must mirror `vitest.config.ts`'s `resolve.alias` block exactly (the `$lib` alias is required)
- Test pattern: `include: ['tests/**/*.integration.test.ts']`
- Test timeout: `60000` (60s — longer than the main 30s because real DB writes are slower)
- `pool: 'forks'` and `poolOptions.forks.singleFork: true` — serialize tests within a file to avoid transaction interleaving (each test gets its own DB transaction)
- `sequence.concurrent: false` — run tests serially within a file
- Do NOT touch the existing `vitest.config.ts` or `test` script — only add new entries
- Do NOT add any new dependencies to `package.json` — use what's already installed

## Estimated LOC
~50 lines (config) + ~4 lines (package.json edits) + ~2 lines (gitignore)

## Definition of Done
- File `vitest.integration.config.ts` exists
- `package.json` has the two new scripts (verify with `grep '"test:integration"' package.json`)
- `.gitignore` has `.planning/claims/` line
- `pnpm run check` passes with zero errors
- `pnpm run lint vitest.integration.config.ts` passes
- `pnpm test:integration --help` runs without error (it won't find any tests yet, but should exit cleanly with "no test files found")
- Write a one-page summary to `.planning/results/mt-005.md`