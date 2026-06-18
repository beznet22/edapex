# Microtask mt-012 — validation and report

## Goal
Run the full integration test suite end-to-end, verify all 11 microtasks' outputs pass, verify no permanent DB pollution, and write a final consolidated report.

## Scope (files to READ)
- All files in `.planning/results/` (one summary per microtask)
- All test files written by mt-006 through mt-011
- `.planning/plan.json` (for the validation checklist)
- `package.json` (for `test:integration` script)

## Scope (NOT to read)
- Do NOT read any src/ file (other than what test files require)
- Do NOT modify any test or src/ file — this is a read-only validation step

## Outputs (files to WRITE)
- `.planning/results/mt-012-validation-and-report.md` — the consolidated validation report

## Constraints
- TypeScript strict, but this task is mostly shell commands + report writing
- Do NOT introduce new dependencies or config
- Run these validations in order and capture output:
  1. `pnpm run check` — must pass
  2. `pnpm run lint tests/lib/server/mastra/integration-helpers/ tests/lib/server/repository/ tests/lib/server/mastra/editor/ tests/lib/server/mastra/workflows/` — must pass
  3. `pnpm test` — existing mock tests still green (catches regression)
  4. `pnpm test:integration` — all integration tests pass
  5. `mysql -h 127.0.0.1 -u devuser -p'paxxw0rd@2791' devdb -e "SELECT COUNT(*) FROM sm_schools WHERE id BETWEEN 9999000 AND 9999999"` — must be 0
  6. `mysql -h 127.0.0.1 -u devuser -p'paxxw0rd@2791' devdb -e "SELECT COUNT(*) FROM sm_students WHERE id BETWEEN 9999000 AND 9999999"` — must be 0
  7. `mysql -h 127.0.0.1 -u devuser -p'paxxw0rd@2791' devdb -e "SELECT COUNT(*) FROM sm_mark_stores WHERE school_id BETWEEN 9999000 AND 9999999"` — must be 0
  8. `sqlite3 tests/.tmp/test.db "SELECT COUNT(*) FROM mastra_threads WHERE resource_id LIKE 'test-thread-%'"` — must be 0 (or whatever the libSQL storage path is; check the existing `LIBSQL_URL` in `.env`)
- Capture the output of each command (pass/fail + relevant excerpts) into the report
- If any check fails, do NOT silently retry — capture the failure as a section in the report
- If any check fails due to a real bug in the test code, dispatch a follow-up microtask via `.planning/microtasks/mt-XXX-fix-*.md` and append the dispatch to the report

## Estimated LOC
~200 lines (mostly markdown report)

## Definition of Done
- File `.planning/results/mt-012-validation-and-report.md` exists and contains:
  - Summary: pass/fail for each of the 8 checks
  - Per-group summary: how many tests ran, how many passed, how long
  - Per-microtask summary: linking to each mt-XXX-*.md summary
  - Known issues section: any documented bugs (e.g., the inverted dedup in mention-resolver)
  - Next steps: any recommended follow-up work
- `.planning/claims/` is empty (no stuck claims)
- `.planning/ledger.jsonl` shows all 12 microtasks `completed`
- Write the report and append a final `{"id":"mt-012","status":"completed","ts":<ms>}` line to `.planning/ledger.jsonl`
- Return one sentence: "Subagent mt-012 completed. Report: .planning/results/mt-012-validation-and-report.md"