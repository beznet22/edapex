import { describe, it, expect } from 'vitest';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { ensureProviderSchema } from '$lib/server/mastra/provider/schema';

describe('ensureProviderSchema idempotency', () => {
	it('returns successfully when called once', async () => {
		const db = getAppDb();
		await expect(ensureProviderSchema(db)).resolves.toBeUndefined();
	});

	it('returns successfully when called concurrently (transaction-scoped)', async () => {
		const db = getAppDb();
		const calls = Array.from({ length: 10 }, () => ensureProviderSchema(db));
		const results = await Promise.all(calls);
		expect(results).toHaveLength(10);
		results.forEach((r) => expect(r).toBeUndefined());
	});

	it('returns successfully when called sequentially', async () => {
		const db = getAppDb();
		await ensureProviderSchema(db);
		await ensureProviderSchema(db);
		await expect(ensureProviderSchema(db)).resolves.toBeUndefined();
	});
});
