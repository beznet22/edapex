import { createClient } from '@libsql/client';
const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';

async function main(): Promise<void> {
	const c = createClient({ url: DB_URL });
	try {
		const r = await c.execute("PRAGMA table_info('potluck_config')");
		console.log('potluck_config columns:');
		for (const row of r.rows) {
			console.log('  ', row.name, '(default:', row.dflt_value, ')');
		}
		const r2 = await c.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='potluck_config'");
		console.log('---');
		console.log(r2.rows[0]?.sql ?? '(no sql)');
	} finally {
		c.close();
	}
}

main().catch((e: unknown) => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
