/**
 * Vitest per-test-file setup — runs before every integration test file.
 *
 * The integration project also gates execution on RUN_LIVE_E2E being set in
 * the test scripts (`pnpm test:integration` exports it before invoking
 * vitest). When the env var is absent, plain `pnpm test` runs the unit
 * suite only — the integration project simply has no files matching its
 * include glob that are NOT skipped.
 *
 * Setup files in Vitest 4 cannot call `skip()` from `beforeAll` when they
 * declare fixture args; we therefore do an early-return guard and rely on
 * the project-level `RUN_LIVE_E2E=1` gating in `package.json`.
 */
import { beforeAll, afterAll } from 'vitest';

const LIVE_E2E_ENABLED = process.env.RUN_LIVE_E2E === '1';

if (!LIVE_E2E_ENABLED) {
	// Surface a single warning so accidental unit-mode runs of an integration
	// test surface visibly in the console.
	console.warn('[integration] RUN_LIVE_E2E is not set; live E2E tests will exit early.');
}

beforeAll(() => {
	if (!LIVE_E2E_ENABLED) {
		throw new Error(
			'RUN_LIVE_E2E must be set to run integration tests. Use `pnpm test:integration`.'
		);
	}
});

afterAll(async () => {
	if (!LIVE_E2E_ENABLED) return;
	try {
		const { closeDatabase } = await import('$lib/server/db');
		await closeDatabase();
	} catch {
		// closeDatabase is idempotent; ignore double-close errors.
	}
});
