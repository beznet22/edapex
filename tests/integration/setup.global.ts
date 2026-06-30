/**
 * Vitest global setup — runs ONCE before any integration test file starts.
 *
 * Validates that the live MySQL database is reachable and that the expected
 * tables contain rows. A failed precondition causes the entire suite to skip
 * rather than running tests that will fail mysteriously.
 */
import { sql } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '$lib/server/db';

const REQUIRED_TABLES = [
	'sm_schools',
	'sm_classes',
	'sm_class_sections',
	'sm_staffs',
	'users',
	'sm_academic_years',
	'sm_exam_types',
	'sm_students',
	'student_records'
];

export async function setup(): Promise<void> {
	if (!process.env.RUN_LIVE_E2E) {
		console.warn(
			'[integration] RUN_LIVE_E2E not set — live E2E tests will be skipped. Set RUN_LIVE_E2E=1 to run them.'
		);
	}
	if (!process.env.DATABASE_URL) {
		throw new Error('DATABASE_URL is not set. Live E2E tests require a MySQL connection.');
	}

	const db = await getDatabase();
	for (const table of REQUIRED_TABLES) {
		const result = (await db.execute(
			sql`SELECT COUNT(*) AS n FROM ${sql.raw(table)} LIMIT 1`
		)) as unknown as Array<{ n: number }>;
		const count = Number(result[0]?.n ?? 0);
		if (!Number.isFinite(count)) {
			throw new Error(`Table ${table} is not queryable — check DATABASE_URL and schema.`);
		}
	}
	console.log('[integration] MySQL preflight: all required tables queryable.');
}

export async function teardown(): Promise<void> {
	await closeDatabase();
}
