/**
 * Provider schema bootstrap.
 *
 * Single idempotent entry point for verifying that all provider-domain
 * tables required by this module are present. Table creation is owned by
 * the migration runner (src/lib/server/mastra/storage/libsql/migrations/);
 * this function only verifies presence and throws a clear error when a
 * required table is missing — never silently CREATE/ALTER. App code
 * calls `ensureProviderSchema(db)` once per cold start before issuing
 * any provider-domain queries.
 */
import { sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

const REQUIRED_TABLES = [
	'encrypted_credentials',
	'model_visibility',
	'provider_access_policy',
	'potluck_config'
] as const;

export type RequiredProviderTable = (typeof REQUIRED_TABLES)[number];

function tableListSql(): string {
	// REQUIRED_TABLES is a compile-time constant; safe to inline into raw SQL.
	return REQUIRED_TABLES.map((t) => `'${t}'`).join(', ');
}

export async function ensureProviderSchema(db: LibSQLDatabase<any>): Promise<void> {
	const rows = await db.all<{ name: string }>(
		sql.raw(
			`SELECT name FROM sqlite_master WHERE type='table' AND name IN (${tableListSql()})`
		)
	);
	const present = new Set(rows.map((r) => r.name));
	const missing = REQUIRED_TABLES.filter((t) => !present.has(t));
	if (missing.length > 0) {
		throw new Error(
			`Provider schema is missing required tables: ${missing.join(', ')}. ` +
				`Run the migration runner (src/lib/server/mastra/storage/libsql/migrations/runner.ts) before starting the app.`
		);
	}
}
