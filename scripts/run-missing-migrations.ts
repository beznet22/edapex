/**
 * One-shot migration runner. Runs any MIGRATIONS not yet recorded in
 * `_MIGRATIONS`. Designed to be safe to re-run; each statement that
 * fails with `already exists` is logged and skipped (the SQL is
 * idempotent for CREATE TABLE/INDEX).
 *
 * Invoke from project root:
 *   pnpm tsx scripts/run-missing-migrations.ts
 */
import { createClient } from '@libsql/client';
import { MIGRATIONS } from '../src/lib/server/mastra/storage/libsql/migrations/registry';
import { MIGRATION_001_INIT_SQL } from '../src/lib/server/mastra/storage/libsql/migrations/001-init';

const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';
const client = createClient({ url: DB_URL });

async function main(): Promise<void> {
	await client.execute(MIGRATION_001_INIT_SQL);
	const { rows } = await client.execute('SELECT id FROM _MIGRATIONS');
	const applied = new Set(rows.map((r) => String((r as { id: unknown }).id)));
	console.log(`Already applied (${applied.size}): ${[...applied].join(', ') || '(none)'}`);

	const pending = MIGRATIONS.filter((m) => !applied.has(m.id));
	console.log(`Pending (${pending.length}): ${pending.map((m) => m.id).join(', ') || '(none)'}`);

	for (const m of pending) {
		const statements = m.upSql
			.split(/;\s*(?:\n|$)/)
			.map((s) => s.trim())
			.filter((s) => s.length > 0 && !s.startsWith('--'));
		for (const stmt of statements) {
			try {
				await client.execute(stmt);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (/already exists/i.test(msg)) {
					console.log(`  ${m.id}: skip (already exists)`);
					continue;
				}
				console.error(`  ${m.id}: FAIL\n${stmt.slice(0, 200)}...\n  -> ${msg}`);
				throw err;
			}
		}
		await client.execute({
			sql: 'INSERT INTO _MIGRATIONS (id, name) VALUES (?, ?)',
			args: [m.id, m.name]
		});
		console.log(`  ${m.id}: applied`);
	}

	client.close();
}

main().then(
	() => process.exit(0),
	(err: unknown) => {
		console.error(err);
		process.exit(1);
	}
);
