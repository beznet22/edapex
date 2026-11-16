import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	runWithCache,
	getRequestCache,
	getCachedUserCredential,
	getCachedHiddenModelIdsForUser,
	getCachedPotluckConfig,
	invalidateCachedCredential,
	invalidateCachedPotluckConfig,
	invalidateCachedVisibility,
	invalidateAllForUser
} from './cache';
import * as credentials from './credentials';
import * as visibility from './visibility';
import * as potluck from './potluck';

vi.mock('./credentials', () => ({
	getUserCredential: vi.fn()
}));

vi.mock('./visibility', () => ({
	getHiddenModelIdsForUser: vi.fn(),
	getEnabledModelIdsForUser: vi.fn()
}));

vi.mock('./potluck', () => ({
	getPotluckConfig: vi.fn()
}));

describe('runWithCache', () => {
	it('runs function inside a cache context', async () => {
		await runWithCache(async () => {
			const cache = getRequestCache();
			expect(cache).toBeDefined();
			expect(cache?.credentials.size).toBe(0);
			expect(cache?.visibility.size).toBe(0);
			expect(cache?.potluck.size).toBe(0);
		});
	});

	it('returns the function result', async () => {
		const result = await runWithCache(async () => 'done');
		expect(result).toBe('done');
	});
});

describe('getCachedUserCredential', () => {
	beforeEach(() => {
		vi.mocked(credentials.getUserCredential).mockReset();
	});

	it('falls back to getUserCredential when no cache', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const expected = { id: 1, userId: 1, providerId: 'groq', apiKey: 'k' };
		vi.mocked(credentials.getUserCredential).mockResolvedValue(expected as any);
		const result = await getCachedUserCredential(db, {}, 1, 'groq');
		expect(result).toBe(expected);
		expect(credentials.getUserCredential).toHaveBeenCalledTimes(1);
	});

	it('caches credential within runWithCache', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const expected = { id: 1, userId: 1, providerId: 'groq', apiKey: 'k' };
		vi.mocked(credentials.getUserCredential).mockResolvedValue(expected as any);

		await runWithCache(async () => {
			const a = await getCachedUserCredential(db, {}, 1, 'groq');
			const b = await getCachedUserCredential(db, {}, 1, 'groq');
			expect(a).toBe(expected);
			expect(b).toBe(expected);
			expect(credentials.getUserCredential).toHaveBeenCalledTimes(1);
		});
	});

	it('caches null results', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);

		await runWithCache(async () => {
			const a = await getCachedUserCredential(db, {}, 1, 'groq');
			const b = await getCachedUserCredential(db, {}, 1, 'groq');
			expect(a).toBeNull();
			expect(b).toBeNull();
			expect(credentials.getUserCredential).toHaveBeenCalledTimes(1);
		});
	});

	it('invalidates cached credential', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const row = { id: 1 };
		vi.mocked(credentials.getUserCredential).mockResolvedValue(row as any);

		await runWithCache(async () => {
			await getCachedUserCredential(db, {}, 1, 'groq');
			invalidateCachedCredential(1, 'groq');
			await getCachedUserCredential(db, {}, 1, 'groq');
			expect(credentials.getUserCredential).toHaveBeenCalledTimes(2);
		});
	});
});

describe('getCachedHiddenModelIdsForUser', () => {
	beforeEach(() => {
		vi.mocked(visibility.getHiddenModelIdsForUser).mockReset();
	});

	it('falls back when no cache', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const hidden = new Set(['m1']);
		vi.mocked(visibility.getHiddenModelIdsForUser).mockResolvedValue(hidden as any);
		const result = await getCachedHiddenModelIdsForUser(db, 1);
		expect(result).toBe(hidden);
	});

	it('caches and invalidates visibility', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const hidden = new Set(['m1']);
		vi.mocked(visibility.getHiddenModelIdsForUser).mockResolvedValue(hidden as any);

		await runWithCache(async () => {
			await getCachedHiddenModelIdsForUser(db, 1);
			invalidateCachedVisibility(1);
			await getCachedHiddenModelIdsForUser(db, 1);
			expect(visibility.getHiddenModelIdsForUser).toHaveBeenCalledTimes(2);
		});
	});
});

describe('getCachedPotluckConfig', () => {
	beforeEach(() => {
		vi.mocked(potluck.getPotluckConfig).mockReset();
	});

	it('falls back when no cache', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const config = { schoolId: 1, enabled: 1 };
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(config as any);
		const result = await getCachedPotluckConfig(db, 1);
		expect(result).toBe(config);
	});

	it('caches and invalidates potluck config', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		const config = { schoolId: 1, enabled: 1 };
		vi.mocked(potluck.getPotluckConfig).mockResolvedValue(config as any);

		await runWithCache(async () => {
			await getCachedPotluckConfig(db, 1);
			invalidateCachedPotluckConfig(1);
			await getCachedPotluckConfig(db, 1);
			expect(potluck.getPotluckConfig).toHaveBeenCalledTimes(2);
		});
	});
});

describe('invalidateAllForUser', () => {
	beforeEach(() => {
		vi.mocked(credentials.getUserCredential).mockReset();
		vi.mocked(visibility.getHiddenModelIdsForUser).mockReset();
		vi.mocked(visibility.getEnabledModelIdsForUser).mockReset();
	});

	it('drops every credential + visibility entry for a user in one call', async () => {
		const db = {} as import('drizzle-orm/libsql').LibSQLDatabase<any>;
		vi.mocked(credentials.getUserCredential).mockResolvedValue(null);
		vi.mocked(visibility.getHiddenModelIdsForUser).mockResolvedValue(new Set() as any);
		vi.mocked(visibility.getEnabledModelIdsForUser).mockResolvedValue(new Set() as any);

		await runWithCache(async () => {
			await getCachedUserCredential(db, {}, 1, 'groq');
			await getCachedUserCredential(db, {}, 1, 'deepseek');
			await getCachedUserCredential(db, {}, 2, 'groq');
			await getCachedHiddenModelIdsForUser(db, 1);
			invalidateAllForUser(1);
			await getCachedUserCredential(db, {}, 1, 'groq');
			await getCachedUserCredential(db, {}, 1, 'deepseek');
			await getCachedUserCredential(db, {}, 2, 'groq');
			await getCachedHiddenModelIdsForUser(db, 1);

			// user 1 → 2 providers re-fetched (the initial 2 + the 2 after invalidation)
			// user 2 → still cached (1 call total)
			// visibility → re-fetched once
			expect(credentials.getUserCredential).toHaveBeenCalledTimes(5);
			expect(visibility.getHiddenModelIdsForUser).toHaveBeenCalledTimes(2);
		});
	});
});
