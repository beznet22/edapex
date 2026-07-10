import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { userModelVisibility } from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	getHiddenModelIdsForUser,
	setModelVisibility,
	setAllModelVisibility
} from './visibility';

const USER_ID = 98200;

async function cleanup(): Promise<void> {
	const db = getAppDb();
	await db.delete(userModelVisibility).where(eq(userModelVisibility.userId, USER_ID));
}

describe('visibility', () => {
	beforeEach(cleanup);
	afterEach(cleanup);

	it('returns empty set when no rows exist', async () => {
		const db = getAppDb();
		const hidden = await getHiddenModelIdsForUser(db, USER_ID);
		expect(hidden).toBeInstanceOf(Set);
		expect(hidden.size).toBe(0);
	});

	it('collects hidden model ids', async () => {
		const db = getAppDb();
		await setModelVisibility(db, USER_ID, 'model-a', false);
		await setModelVisibility(db, USER_ID, 'model-b', true);
		await setModelVisibility(db, USER_ID, 'model-c', false);

		const hidden = await getHiddenModelIdsForUser(db, USER_ID);
		expect([...hidden]).toContain('model-a');
		expect([...hidden]).toContain('model-c');
		expect([...hidden]).not.toContain('model-b');
	});

	it('upserts visibility on conflict', async () => {
		const db = getAppDb();
		await setModelVisibility(db, USER_ID, 'model-a', false);
		await setModelVisibility(db, USER_ID, 'model-a', true);

		const hidden = await getHiddenModelIdsForUser(db, USER_ID);
		expect(hidden.has('model-a')).toBe(false);
	});

	it('sets visibility for many models', async () => {
		const db = getAppDb();
		await setAllModelVisibility(db, USER_ID, ['model-a', 'model-b'], false);

		const hidden = await getHiddenModelIdsForUser(db, USER_ID);
		expect(hidden.has('model-a')).toBe(true);
		expect(hidden.has('model-b')).toBe(true);
	});
});
