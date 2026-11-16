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
import { getHiddenModelIdsForUser, getEnabledModelIdsForUser } from './visibility';
import { getPotluckConfig } from './potluck';
import type { ProviderId, ModelId } from './types';

export interface RequestCache {
	/** userId:providerId → credential row (null is a real cached value, not
	 *  "uncached") */
	credentials: Map<string, EncryptedCredential | null>;
	/** userId → hidden model ids */
	visibility: Map<string, Set<ModelId>>;
	/** userId → explicitly enabled (non-catalog) model ids */
	enabledModels: Map<string, Set<ModelId>>;
	/** schoolId → potluck config row */
	potluck: Map<string, PotluckConfig | null>;
}

const storage = new AsyncLocalStorage<RequestCache>();

export function runWithCache<T>(fn: () => T | Promise<T>): Promise<T> {
	const cache: RequestCache = {
		credentials: new Map(),
		visibility: new Map(),
		enabledModels: new Map(),
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
	if (cache.credentials.has(key)) {
		// Stored value is a real `null` when the DB confirmed no credential
		// exists, or the row when one was found. Either way we honour the
		// cache — including the "no credential" sentinel — so subsequent
		// calls don't re-query for the same (userId, providerId) pair.
		return cache.credentials.get(key) ?? null;
	}
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
	if (cache.visibility.has(key)) {
		return cache.visibility.get(key) ?? new Set();
	}
	const fetched = await getHiddenModelIdsForUser(db, userId);
	cache.visibility.set(key, fetched);
	return fetched;
}

export async function getCachedEnabledModelIdsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Set<ModelId>> {
	const cache = getRequestCache();
	if (!cache) {
		return getEnabledModelIdsForUser(db, userId);
	}
	const key = visibilityKey(userId);
	if (cache.enabledModels.has(key)) {
		return cache.enabledModels.get(key) ?? new Set();
	}
	const fetched = await getEnabledModelIdsForUser(db, userId);
	cache.enabledModels.set(key, fetched);
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
	if (cache.potluck.has(key)) {
		return cache.potluck.get(key) ?? null;
	}
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
	cache.enabledModels.delete(visibilityKey(userId));
}

/**
 * Drop every cached entry that belongs to a single user (credentials,
 * hiddenIds, enabledIds). Called from the credentials command after a
 * save or delete so the same request lifecycle (or the next one) sees
 * the fresh row. Safe to call with or without an active request cache.
 */
export function invalidateAllForUser(userId: number): void {
	const cache = getRequestCache();
	if (!cache) return;
	const prefix = `${userId}:`;
	for (const key of cache.credentials.keys()) {
		if (key.startsWith(prefix)) cache.credentials.delete(key);
	}
	cache.visibility.delete(visibilityKey(userId));
	cache.enabledModels.delete(visibilityKey(userId));
}
