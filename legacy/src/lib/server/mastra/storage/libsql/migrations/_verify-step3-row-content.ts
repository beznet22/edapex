/**
 * Row-content sanity check — confirms the migrated rows map to the right
 * unified-table fields and that potluck_config retained its original row.
 */
import { createClient } from '@libsql/client';
const DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';

async function main(): Promise<void> {
	const c = createClient({ url: DB_URL });
	try {
		const pc = await c.execute('SELECT school_id, enabled, tos_version FROM potluck_config');
		console.log('potluck_config rows:');
		for (const r of pc.rows) console.log('  ', r);

		const ec = await c.execute(
			'SELECT id, scope, credential_kind, user_id, school_id, provider_id, enabled FROM encrypted_credentials'
		);
		console.log('encrypted_credentials rows:');
		for (const r of ec.rows) console.log('  ', r);

		const pap = await c.execute(
			'SELECT id, school_id, rule_type, target, provider_id, model_id FROM provider_access_policy'
		);
		console.log('provider_access_policy rows:');
		for (const r of pap.rows) console.log('  ', r);

		const mv = await c.execute('SELECT id, scope, user_id, school_id, model_id, visible FROM model_visibility');
		console.log('model_visibility rows:');
		for (const r of mv.rows) console.log('  ', r);
	} finally {
		c.close();
	}
}

main().catch((e: unknown) => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exit(1);
});
