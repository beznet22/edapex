import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LRUCache } from '$lib/server/mastra/tools/internal/lru-cache';

describe('LRUCache', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('basic get/set', () => {
		it('stores and retrieves a value', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('key1', 'value1');
			expect(cache.get('key1')).toBe('value1');
		});

		it('returns undefined for missing keys', () => {
			const cache = new LRUCache<string>(10, 60_000);
			expect(cache.get('nonexistent')).toBeUndefined();
		});

		it('overwrites existing keys', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('key1', 'first');
			cache.set('key1', 'second');
			expect(cache.get('key1')).toBe('second');
			expect(cache.size).toBe(1);
		});

		it('stores multiple entries', () => {
			const cache = new LRUCache<number>(10, 60_000);
			cache.set('a', 1);
			cache.set('b', 2);
			cache.set('c', 3);
			expect(cache.get('a')).toBe(1);
			expect(cache.get('b')).toBe(2);
			expect(cache.get('c')).toBe(3);
			expect(cache.size).toBe(3);
		});
	});

	describe('LRU eviction', () => {
		it('evicts the least-recently-used entry when capacity is exceeded', () => {
			const cache = new LRUCache<string>(3, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			// Cache is full, inserting 'd' should evict 'a' (LRU)
			cache.set('d', '4');
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe('2');
			expect(cache.get('c')).toBe('3');
			expect(cache.get('d')).toBe('4');
			expect(cache.size).toBe(3);
		});

		it('get() promotes entry to most-recently-used', () => {
			const cache = new LRUCache<string>(3, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			// Access 'a' to promote it
			cache.get('a');
			// Now 'b' is LRU, inserting 'd' should evict 'b'
			cache.set('d', '4');
			expect(cache.get('a')).toBe('1');
			expect(cache.get('b')).toBeUndefined();
			expect(cache.get('c')).toBe('3');
			expect(cache.get('d')).toBe('4');
		});

		it('set() on existing key promotes it to most-recently-used', () => {
			const cache = new LRUCache<string>(3, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			// Update 'a' to promote it
			cache.set('a', 'updated');
			// Now 'b' is LRU
			cache.set('d', '4');
			expect(cache.get('a')).toBe('updated');
			expect(cache.get('b')).toBeUndefined();
		});

		it('never exceeds maxSize', () => {
			const cache = new LRUCache<number>(5, 60_000);
			for (let i = 0; i < 20; i++) {
				cache.set(`key${i}`, i);
			}
			expect(cache.size).toBe(5);
		});

		it('evicts in correct order with interleaved gets', () => {
			const cache = new LRUCache<string>(3, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			// Access order: a, then c — so b is LRU
			cache.get('a');
			cache.get('c');
			cache.set('d', '4');
			expect(cache.get('b')).toBeUndefined();
			expect(cache.get('a')).toBe('1');
			expect(cache.get('c')).toBe('3');
			expect(cache.get('d')).toBe('4');
		});
	});

	describe('TTL expiration', () => {
		it('returns undefined for expired entries on get()', () => {
			const cache = new LRUCache<string>(10, 1000); // 1 second TTL
			cache.set('key1', 'value1');
			expect(cache.get('key1')).toBe('value1');

			// Advance time past TTL
			vi.advanceTimersByTime(1001);
			expect(cache.get('key1')).toBeUndefined();
		});

		it('returns value for entries within TTL', () => {
			const cache = new LRUCache<string>(10, 5000);
			cache.set('key1', 'value1');

			vi.advanceTimersByTime(4999);
			expect(cache.get('key1')).toBe('value1');
		});

		it('has() returns false for expired entries', () => {
			const cache = new LRUCache<string>(10, 1000);
			cache.set('key1', 'value1');
			expect(cache.has('key1')).toBe(true);

			vi.advanceTimersByTime(1001);
			expect(cache.has('key1')).toBe(false);
		});

		it('expired entries are removed from cache on access', () => {
			const cache = new LRUCache<string>(10, 1000);
			cache.set('key1', 'value1');
			expect(cache.size).toBe(1);

			vi.advanceTimersByTime(1001);
			cache.get('key1'); // triggers removal
			expect(cache.size).toBe(0);
		});

		it('expired entries are removed from cache on has()', () => {
			const cache = new LRUCache<string>(10, 1000);
			cache.set('key1', 'value1');

			vi.advanceTimersByTime(1001);
			cache.has('key1'); // triggers removal
			expect(cache.size).toBe(0);
		});

		it('different entries expire independently based on insertion time', () => {
			const cache = new LRUCache<string>(10, 5000);
			cache.set('a', '1');
			vi.advanceTimersByTime(3000);
			cache.set('b', '2');
			vi.advanceTimersByTime(2001);

			// 'a' was inserted 5001ms ago — expired
			expect(cache.get('a')).toBeUndefined();
			// 'b' was inserted 2001ms ago — still valid
			expect(cache.get('b')).toBe('2');
		});
	});

	describe('has()', () => {
		it('returns true for existing non-expired keys', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('key1', 'value1');
			expect(cache.has('key1')).toBe(true);
		});

		it('returns false for non-existent keys', () => {
			const cache = new LRUCache<string>(10, 60_000);
			expect(cache.has('missing')).toBe(false);
		});

		it('does not promote entry on has()', () => {
			const cache = new LRUCache<string>(3, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			// has() should NOT promote 'a'
			cache.has('a');
			// 'a' should still be LRU
			cache.set('d', '4');
			expect(cache.get('a')).toBeUndefined();
		});
	});

	describe('size', () => {
		it('returns 0 for empty cache', () => {
			const cache = new LRUCache<string>(10, 60_000);
			expect(cache.size).toBe(0);
		});

		it('reflects current entry count', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('a', '1');
			expect(cache.size).toBe(1);
			cache.set('b', '2');
			expect(cache.size).toBe(2);
		});

		it('does not exceed maxSize', () => {
			const cache = new LRUCache<string>(2, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			expect(cache.size).toBe(2);
		});
	});

	describe('clear()', () => {
		it('removes all entries', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			cache.set('c', '3');
			cache.clear();
			expect(cache.size).toBe(0);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBeUndefined();
			expect(cache.get('c')).toBeUndefined();
		});

		it('allows new entries after clear', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('a', '1');
			cache.clear();
			cache.set('b', '2');
			expect(cache.get('b')).toBe('2');
			expect(cache.size).toBe(1);
		});
	});

	describe('type generics', () => {
		it('works with object values', () => {
			interface SearchResult {
				title: string;
				url: string;
			}
			const cache = new LRUCache<SearchResult[]>(10, 60_000);
			const results = [{ title: 'Test', url: 'https://example.com' }];
			cache.set('query1', results);
			expect(cache.get('query1')).toEqual(results);
		});

		it('works with number values', () => {
			const cache = new LRUCache<number>(10, 60_000);
			cache.set('count', 42);
			expect(cache.get('count')).toBe(42);
		});

		it('works with boolean values', () => {
			const cache = new LRUCache<boolean>(10, 60_000);
			cache.set('flag', true);
			expect(cache.get('flag')).toBe(true);
		});
	});

	describe('edge cases', () => {
		it('handles maxSize of 1', () => {
			const cache = new LRUCache<string>(1, 60_000);
			cache.set('a', '1');
			cache.set('b', '2');
			expect(cache.size).toBe(1);
			expect(cache.get('a')).toBeUndefined();
			expect(cache.get('b')).toBe('2');
		});

		it('handles empty string keys', () => {
			const cache = new LRUCache<string>(10, 60_000);
			cache.set('', 'empty-key-value');
			expect(cache.get('')).toBe('empty-key-value');
		});

		it('handles very long keys', () => {
			const cache = new LRUCache<string>(10, 60_000);
			const longKey = 'k'.repeat(10_000);
			cache.set(longKey, 'value');
			expect(cache.get(longKey)).toBe('value');
		});

		it('handles TTL of 0 (immediate expiration)', () => {
			const cache = new LRUCache<string>(10, 0);
			cache.set('key', 'value');
			// With TTL 0, even at the same timestamp the entry is not expired
			// because Date.now() - createdAt = 0, which is NOT > 0
			expect(cache.get('key')).toBe('value');
			vi.advanceTimersByTime(1);
			expect(cache.get('key')).toBeUndefined();
		});
	});
});
