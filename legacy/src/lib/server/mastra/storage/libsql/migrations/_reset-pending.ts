/**
 * One-shot recovery helper — deletes _MIGRATIONS rows for 003-006 that the
 * step-2 runner incorrectly recorded when their upSql was a comment-only
 * placeholder. Step 2 only writes the three new tables; 003-006 must be
 * re-runnable for steps 3 to fill in the real data-migration SQL.
 */
import { createClient } from '@libsql/client';

const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';

async function main(): Promise<void> {
	const client = createClient({ url: DB_URL });
	try {
		const before = await client.execute('SELECT id FROM _MIGRATIONS ORDER BY id');
		console.log('Before:', before.rows.map((r) => String(r.id)).join(', '));

		const ids = ['003_migrate_credentials', '004_migrate_visibility', '005_migrate_access_policy', '006_drop_source_tables'];
		for (const id of ids) {
			await client.execute({ sql: 'DELETE FROM _MIGRATIONS WHERE id = ?', args: [id] });
		}

		const after = await client.execute('SELECT id FROM _MIGRATIONS ORDER BY id');
		console.log('After:', after.rows.map((r) => String(r.id)).join(', '));

		const tables = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'mastra_%' ORDER BY name"
		);
		console.log('Tables:');
		for (const r of tables.rows) {
			console.log('  ', r.name);
		}
	} finally {
		client.close();
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
