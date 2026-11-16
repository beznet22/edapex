import { type TenantContext } from './tenant-context';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
	tenant: TenantContext;
	expiresAt: number;
}

/**
 * Per-session TenantContext cache with 5-minute passive TTL.
 * `/switch` operations synchronously bust the cache before responding.
 *
 * Spec: slash_command_specs.md §5.1 — "/switch" cache bust
 */
export class TenantContextCache {
	private cache = new Map<string, CacheEntry>();

	/**
	 * Get a cached TenantContext, or hydrate via the provided loader.
	 */
	async getOrHydrate(
		sessionId: string,
		hydrateFn: () => Promise<TenantContext>
	): Promise<TenantContext> {
		const entry = this.cache.get(sessionId);

		if (entry && Date.now() < entry.expiresAt) {
			return entry.tenant;
		}

		const tenant = await hydrateFn();
		this.set(sessionId, tenant);
		return tenant;
	}

	/**
	 * Set a cache entry with TTL.
	 */
	set(sessionId: string, tenant: TenantContext): void {
		this.cache.set(sessionId, {
			tenant,
			expiresAt: Date.now() + CACHE_TTL_MS
		});
	}

	/**
	 * Synchronous cache-bust for `/switch` operations.
	 * Flushes the old entry before the response is returned.
	 */
	bustCache(sessionId: string): void {
		this.cache.delete(sessionId);
	}

	/**
	 * Check if a session has a valid cached entry.
	 */
	has(sessionId: string): boolean {
		const entry = this.cache.get(sessionId);
		if (!entry) return false;
		if (Date.now() >= entry.expiresAt) {
			this.cache.delete(sessionId);
			return false;
		}
		return true;
	}

	/**
	 * Get cache size (for testing).
	 */
	get size(): number {
		return this.cache.size;
	}
}
