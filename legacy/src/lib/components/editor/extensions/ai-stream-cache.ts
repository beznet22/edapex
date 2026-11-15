/**
 * AI Stream Cache — localStorage helpers for aiStreamBlock discard/accept.
 *
 * When the user starts an "Improve" edit, the original selected text is cached
 * in localStorage keyed by the stream's unique id. On Discard the original
 * text is restored; on Accept the entry is deleted. Entries older than 1 hour
 * are cleaned up on each new stream to prevent localStorage from filling up
 * with orphaned entries from abandoned streams (e.g. browser closed mid-stream).
 */
const CACHE_PREFIX = "edapex:ai-stream-original:";
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
	text: string;
	timestamp: number;
}

export function cacheOriginalText(streamId: string, text: string): void {
	try {
		const entry: CacheEntry = { text, timestamp: Date.now() };
		localStorage.setItem(`${CACHE_PREFIX}${streamId}`, JSON.stringify(entry));
	} catch {
		// localStorage may be unavailable (private mode, quota); the in-flight
		// stream still works, only the Discard restore is lost.
	}
}

export function getCachedOriginalText(streamId: string): string | null {
	try {
		const raw = localStorage.getItem(`${CACHE_PREFIX}${streamId}`);
		if (!raw) return null;
		const entry = JSON.parse(raw) as CacheEntry;
		if (typeof entry.text !== "string") return null;
		if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
			localStorage.removeItem(`${CACHE_PREFIX}${streamId}`);
			return null;
		}
		return entry.text;
	} catch {
		return null;
	}
}

export function deleteCachedOriginalText(streamId: string): void {
	try {
		localStorage.removeItem(`${CACHE_PREFIX}${streamId}`);
	} catch {
		/* ignore */
	}
}

export function cleanupStaleCacheEntries(): void {
	try {
		const now = Date.now();
		const toRemove: string[] = [];
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (!key?.startsWith(CACHE_PREFIX)) continue;
			const raw = localStorage.getItem(key);
			if (!raw) continue;
			const entry = JSON.parse(raw) as CacheEntry;
			if (now - entry.timestamp > CACHE_TTL_MS) toRemove.push(key);
		}
		for (const key of toRemove) localStorage.removeItem(key);
	} catch {
		/* ignore */
	}
}
