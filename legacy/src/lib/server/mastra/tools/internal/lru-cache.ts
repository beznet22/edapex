// Verified: Mastra provides InMemoryServerCache (@mastra/core/cache) but it lacks LRU eviction, per-key TTL, synchronous access, and type generics. Custom LRUCache<T> built for search/fetch caching requirements.

interface CacheEntry<T> {
	value: T;
	createdAt: number;
}

/**
 * A generic LRU (Least Recently Used) cache with time-based expiration.
 *
 * - Evicts the least-recently-used entry when capacity is exceeded.
 * - Entries older than `ttlMs` are treated as expired and not returned on lookup.
 * - `get()` promotes an entry to most-recently-used.
 * - All operations are synchronous.
 */
export class LRUCache<T> {
	private cache = new Map<string, CacheEntry<T>>();

	constructor(
		private maxSize: number,
		private ttlMs: number
	) {}

	/**
	 * Retrieve a value by key. Returns `undefined` if the key does not exist
	 * or the entry has expired. Promotes the entry to most-recently-used on hit.
	 */
	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;

		// Check TTL expiration
		if (Date.now() - entry.createdAt > this.ttlMs) {
			this.cache.delete(key);
			return undefined;
		}

		// Promote to most-recently-used by re-inserting
		this.cache.delete(key);
		this.cache.set(key, entry);

		return entry.value;
	}

	/**
	 * Store a value. If the cache is at capacity, evicts the least-recently-used entry first.
	 */
	set(key: string, value: T): void {
		// If key already exists, delete it first so re-insertion moves it to the end
		if (this.cache.has(key)) {
			this.cache.delete(key);
		}

		// Evict LRU entry if at capacity
		if (this.cache.size >= this.maxSize) {
			const lruKey = this.cache.keys().next().value;
			if (lruKey !== undefined) {
				this.cache.delete(lruKey);
			}
		}

		this.cache.set(key, { value, createdAt: Date.now() });
	}

	/**
	 * Check if a key exists and is not expired. Does NOT promote the entry.
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) return false;

		if (Date.now() - entry.createdAt > this.ttlMs) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Returns the number of entries currently in the cache (including potentially expired ones
	 * that haven't been accessed yet).
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Remove all entries from the cache.
	 */
	clear(): void {
		this.cache.clear();
	}
}
