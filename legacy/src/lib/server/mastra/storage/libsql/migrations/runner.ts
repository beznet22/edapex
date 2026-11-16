/**
 * Migration runner — idempotent, transaction-scoped, _MIGRATIONS-tracked.
 *
 * Boot order on `applyMigrations(db)`:
 *   1. CREATE TABLE IF NOT EXISTS _MIGRATIONS (idempotent bootstrap)
 *   2. SELECT id FROM _MIGRATIONS → applied set
 *   3. For each MIGRATIONS registry entry whose id is NOT in applied set:
 *        BEGIN; <upSql>; INSERT INTO _MIGRATIONS; COMMIT;
 *      On failure: ROLLBACK and re-throw (the failed migration is left
 *      unrecorded so the next cold start re-applies it).
 *
 * Production callers should `await applyMigrations(getAppDb())` once at
 * server startup, NOT inside hot paths. The runner caches the applied set
 * for the lifetime of one invocation; each call re-queries _MIGRATIONS so
 * state stays consistent across processes.
 *
 * --dry-run CLI mode prints the 5 pending migrations and exits 0 without
 * applying anything. Used by `pnpm tsx .../runner.ts --dry-run`.
 */
import { createClient, type Client } from '@libsql/client';
import { MIGRATIONS, type Migration } from './registry';
import { BOOTSTRAP_MIGRATION_ID, BOOTSTRAP_MIGRATION_NAME, MIGRATION_001_INIT_SQL } from './001-init';
import { resolveDbUrl } from '../db-url';

const DB_URL = resolveDbUrl();

async function ensureMigrationsTable(client: Client): Promise<void> {
	await client.execute(MIGRATION_001_INIT_SQL);
}

async function loadApplied(client: Client): Promise<Set<string>> {
	const { rows } = await client.execute('SELECT id FROM _MIGRATIONS');
	return new Set(rows.map((r) => String(r.id)));
}

function splitStatements(sql: string): string[] {
	return sql
		.split(/;\s*(?:\n|$)/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && !s.startsWith('--'));
}

async function applyOne(client: Client, m: Migration): Promise<void> {
	const statements = splitStatements(m.upSql);
	await client.execute('BEGIN');
	try {
		for (const stmt of statements) {
			await client.execute(stmt);
		}
		await client.execute({
			sql: 'INSERT INTO _MIGRATIONS (id, name) VALUES (?, ?)',
			args: [m.id, m.name]
		});
		await client.execute('COMMIT');
	} catch (err) {
		await client.execute('ROLLBACK');
		throw err;
	}
}

export interface ApplyResult {
	applied: readonly string[];
	skipped: readonly string[];
}

export async function applyMigrations(client: Client): Promise<ApplyResult> {
	await ensureMigrationsTable(client);
	const applied = await loadApplied(client);
	const appliedNow: string[] = [];
	const skipped: string[] = [];

	for (const m of MIGRATIONS) {
		if (applied.has(m.id)) {
			skipped.push(m.id);
			continue;
		}
		await applyOne(client, m);
		appliedNow.push(m.id);
	}

	return { applied: appliedNow, skipped };
}

export async function pendingMigrations(client: Client): Promise<readonly Migration[]> {
	await ensureMigrationsTable(client);
	const applied = await loadApplied(client);
	return MIGRATIONS.filter((m) => !applied.has(m.id));
}

async function main(): Promise<number> {
	const dryRun = process.argv.includes('--dry-run');
	const client = createClient({ url: DB_URL });
	try {
		if (dryRun) {
			const pending = await pendingMigrations(client);
			console.log(`BOOTSTRAP ${BOOTSTRAP_MIGRATION_ID} (already applied at runner startup)`);
			console.log(`PENDING (${pending.length}):`);
			for (const m of pending) {
				console.log(`  - ${m.id}: ${m.name}`);
			}
			return 0;
		}
		const result = await applyMigrations(client);
		console.log(`Applied: ${result.applied.length ? result.applied.join(', ') : '(none)'}`);
		console.log(`Skipped: ${result.skipped.length ? result.skipped.join(', ') : '(none)'}`);
		return 0;
	} finally {
		client.close();
	}
}

const isCli = process.argv[1]?.endsWith('runner.ts') ?? false;
if (isCli) {
	main().then(
		(code) => process.exit(code),
		(err: unknown) => {
			console.error(err instanceof Error ? err.message : String(err));
			process.exit(1);
		}
	);
}
