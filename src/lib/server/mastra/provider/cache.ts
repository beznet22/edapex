/**
 * Per-request caching layer for provider-domain reads.
 *
 * `runWithCache(fn)` brackets a request and gives it a request-scoped cache.
 * Cached readers for user credentials, potluck config, and per-user model
 * visibility deduplicate SELECTs across multiple resolver / tier-router
 * calls without changing the underlying functions.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { EncryptedCredential, PotluckConfig } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { getUserCredential } from './credentials';
import { getHiddenModelIdsForUser } from './visibility';
import { getPotluckConfig } from './potluck';
import type { ProviderId, ModelId } from './types';

export interface RequestCache {
	/** userId:providerId → credential row */
	credentials: Map<string, EncryptedCredential | null>;
	/** userId → hidden model ids */
	visibility: Map<string, Set<ModelId>>;
	/** schoolId → potluck config row */
	potluck: Map<string, PotluckConfig | null>;
}

const storage = new AsyncLocalStorage<RequestCache>();

export function runWithCache<T>(fn: () => T | Promise<T>): Promise<T> {
	const cache: RequestCache = {
		credentials: new Map(),
		visibility: new Map(),
		potluck: new Map()
	};
	return storage.run(cache, async () => fn()) as Promise<T>;
}

export function getRequestCache(): RequestCache | undefined {
	return storage.getStore();
}

function credentialKey(userId: number, providerId: ProviderId): string {
	return `${userId}:${providerId}`;
}

function visibilityKey(userId: number): string {
	return String(userId);
}

function potluckKey(schoolId: number): string {
	return String(schoolId);
}

export async function getCachedUserCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId
): Promise<EncryptedCredential | null> {
	const cache = getRequestCache();
	if (!cache) {
		return getUserCredential(db, env, userId, providerId);
	}
	const key = credentialKey(userId, providerId);
	const cached = cache.credentials.get(key);
	if (cached !== undefined) return cached;
	const fetched = await getUserCredential(db, env, userId, providerId);
	cache.credentials.set(key, fetched);
	return fetched;
}

export async function getCachedHiddenModelIdsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Set<ModelId>> {
	const cache = getRequestCache();
	if (!cache) {
		return getHiddenModelIdsForUser(db, userId);
	}
	const key = visibilityKey(userId);
	const cached = cache.visibility.get(key);
	if (cached !== undefined) return cached;
	const fetched = await getHiddenModelIdsForUser(db, userId);
	cache.visibility.set(key, fetched);
	return fetched;
}

export async function getCachedPotluckConfig(
	db: LibSQLDatabase<any>,
	schoolId: number
): Promise<PotluckConfig | null> {
	const cache = getRequestCache();
	if (!cache) {
		return getPotluckConfig(db, schoolId);
	}
	const key = potluckKey(schoolId);
	const cached = cache.potluck.get(key);
	if (cached !== undefined) return cached;
	const fetched = await getPotluckConfig(db, schoolId);
	cache.potluck.set(key, fetched);
	return fetched;
}

/**
 * Invalidate a cached credential after a write. Safe to call whether or not
 * a request cache is active.
 */
export function invalidateCachedCredential(userId: number, providerId: ProviderId): void {
	const cache = getRequestCache();
	if (!cache) return;
	cache.credentials.delete(credentialKey(userId, providerId));
}

export function invalidateCachedPotluckConfig(schoolId: number): void {
	const cache = getRequestCache();
	if (!cache) return;
	cache.potluck.delete(potluckKey(schoolId));
}

export function invalidateCachedVisibility(userId: number): void {
	const cache = getRequestCache();
	if (!cache) return;
	cache.visibility.delete(visibilityKey(userId));
}
