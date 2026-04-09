# Testing (edapex)

Testing strategy and setup for EdApex V2.

## Frameworks
- **Vitest**: primary test runner for unit and integration tests.
- **Vite**: Used for components and frontend testing.

## Test Structure
- **Location**: All tests reside in `src/tests/` or alongside source files as `.test.ts`.
- **Command**: `pnpm vitest run src/path/to/file.test.ts`

## Patterns
- **Database Mocking**: Use of SQLite/libsql for fast, isolated repository tests.
- **Agent Testing**: Specialized UAT loops for verifying agentic behavior as part of GSD.
- **Multi-tenant Testing**: Verification that `tenant_id` filters are correctly applied and isolated.

## The Stress Lab
- **Chaos Testing**: Sidecar isolation (`MODE=STRESS_LAB`) used for destructive tests and benchmarking section 24 performance.
- **Data Airgap**: Uses disposable SQLite instances for high-risk benchmarks.
