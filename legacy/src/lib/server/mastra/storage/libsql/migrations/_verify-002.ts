/**
 * Verify helper for step 2 — prints the encrypted_credentials CREATE statement
 * (sqlite_master.sql) so we can confirm the CHECK constraint matches the scope
 * invariants. Stand-in for `sqlite3 mastra.db '.schema encrypted_credentials'`,
 * which is unavailable in this environment.
 */
import { createClient } from '@libsql/client';

const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';

async function main(): Promise<void> {
	const client = createClient({ url: DB_URL });
	try {
		const { rows } = await client.execute(
			"SELECT sql FROM sqlite_master WHERE type='table' AND name='encrypted_credentials'"
		);
		const sql = rows[0]?.sql;
		if (typeof sql !== 'string') {
			throw new Error('encrypted_credentials table not found');
		}
		console.log(sql);
		console.log('---');
		const checks: string[] = [
			"CHECK (scope IN ('user', 'school'))",
			"CHECK (credential_kind IN ('personal', 'donation', 'custom'))",
			"scope = 'user' AND user_id IS NOT NULL",
			"scope = 'school' AND school_id IS NOT NULL"
		];
		let pass = true;
		for (const c of checks) {
			const ok = sql.includes(c);
			console.log(`${ok ? 'OK ' : 'FAIL'} ${c}`);
			if (!ok) pass = false;
		}
		if (!pass) process.exit(1);
	} finally {
		client.close();
	}
}

main().catch((err: unknown) => {
	console.error(err instanceof Error ? err.message : String(err));
	process.exit(1);
});
