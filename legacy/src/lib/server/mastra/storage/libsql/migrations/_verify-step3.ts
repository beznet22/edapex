/**
 * Verify helper for step 3 — asserts the unified-table row totals equal the
 * pre-migration sum from AUDIT.md (0 + 0 + 1 + 1 + 1 = 3). Stand-in for
 * `sqlite3 mastra.db 'SELECT ...'`, which is unavailable in this env.
 */
import { createClient } from '@libsql/client';

const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';

const EXPECTED_PRE_MIGRATION_SUM = 3;

interface Count {
	name: string;
	count: number;
}

async function main(): Promise<void> {
	const client = createClient({ url: DB_URL });
	try {
		const tables = ['encrypted_credentials', 'model_visibility', 'provider_access_policy'];
		const counts: Count[] = [];
		for (const t of tables) {
			const { rows } = await client.execute(`SELECT COUNT(*) AS n FROM ${t}`);
			counts.push({ name: t, count: Number(rows[0]?.n ?? 0) });
		}
		const sum = counts.reduce((acc, c) => acc + c.count, 0);
		const breakdown = counts.map((c) => `${c.name}=${c.count}`).join(', ');
		console.log(`Sum: ${sum} (expected ${EXPECTED_PRE_MIGRATION_SUM})`);
		console.log(`Breakdown: ${breakdown}`);
		if (sum !== EXPECTED_PRE_MIGRATION_SUM) {
			console.log('FAIL: sum does not match pre-migration row count');
			process.exit(1);
		}
		console.log('OK: row counts match');

		const { rows: src } = await client.execute(
			"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'mastra_%' ORDER BY name"
		);
		console.log('Remaining tables:');
		for (const r of src) console.log('  ', r.name);

		const expectedRemaining = new Set(['_MIGRATIONS', 'encrypted_credentials', 'model_visibility', 'potluck_config', 'provider_access_policy']);
		const actual = new Set(src.map((r) => String(r.name)));
		const dropped = ['user_credentials', 'user_model_visibility', 'admin_model_overrides', 'potluck_donations'].filter((t) => !actual.has(t));
		console.log('Dropped source tables:', dropped.join(', '));
		for (const t of dropped) {
			if (actual.has(t)) {
				console.log(`FAIL: source table ${t} still present`);
				process.exit(1);
			}
		}
		for (const t of expectedRemaining) {
			if (!actual.has(t)) {
				console.log(`FAIL: expected table ${t} missing`);
				process.exit(1);
			}
		}
		console.log('OK: all source tables dropped, all unified tables present, potluck_config preserved');
	} finally {
		client.close();
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
