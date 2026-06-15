/**
 * Rate-limit class — V2.
 *
 * Slimmed from V1:
 * - Drops `#credCache` / `#urlCache` / `#attemptCount` (V1 gateway used
 *   these to memoize API keys and URLs across calls within a request
 *   lifetime. The V2 resolver does the same per-call inline; the
 *   rate-limit class no longer holds per-gateway state).
 * - Adds `createRateLimitFetch(userId, providerId)` — a factory the V2
 *   resolver attaches to `OpenAICompatibleConfig.fetch` (or the
 *   `createDeepSeek({ fetch })` factory call) so every upstream request
 *   captures `x-ratelimit-*` / `retry-after` headers uniformly.
 *
 * The retry strategy (`decideStrategy`, `requireOrThrow`) and the
 * `data-rateLimit`-driven banner UX are unchanged.
 */
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
	parseResetDuration,
	extractRateLimitFromHeaders,
	type RateLimitState
} from '$lib/provider/rate-limit';
import { rateLimitState, type RateLimitStateRow } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { RateLimitError } from '$lib/provider/errors';
import type { ProviderId } from '$lib/provider/types';

type AnyDb = LibSQLDatabase<any>;

/** Cooldowns shorter than this are waited inline in the gateway, invisible to the user. */
export const RATE_LIMIT_INLINE_THRESHOLD_MS = 2000;

export interface CachedRateLimit {
	providerId: string;
	modelId?: string;
	remainingRequests: number | null;
	remainingTokens: number | null;
	resetAt: Date;
	recordedAt: number;
	source: 'success' | 'error';
}

export interface RetryStrategy {
	mode: 'inline' | 'surface' | 'fail';
	waitMs: number;
	reason: string;
}

interface FetchResponse {
	providerId: string;
	headers: Record<string, string>;
	statusCode: number;
	url: string;
}

const responseCache = new Map<string, CachedRateLimit>();

function cacheKey(userId: number, providerId: string): string {
	return `${userId}:${providerId}`;
}

function computeResetAt(rl: Partial<RateLimitState>): Date | null {
	const seconds =
		rl.retryAfterSeconds ?? parseResetDuration(rl.resetRequests) ?? parseResetDuration(rl.resetTokens);
	if (seconds == null) return null;
	return new Date(Date.now() + seconds * 1000);
}

function captureToCache(
	userId: number,
	providerId: string,
	statusCode: number,
	headers: Record<string, string>
): void {
	const rl = extractRateLimitFromHeaders(providerId, headers);
	// Only cache when the upstream is actually exhausted. Many providers
	// send `x-ratelimit-reset-requests` on every response as a delta
	// until the next window opens (e.g. `60s` for a per-minute window).
	// Caching on every response would falsely throttle the next request
	// even when the caller has plenty of headroom left.
	const exhausted =
		rl.remainingRequests === 0 ||
		rl.remainingTokens === 0 ||
		statusCode === 429 ||
		statusCode === 529;
	if (!exhausted) return;
	const resetAt = computeResetAt(rl);
	if (!resetAt) return;
	responseCache.set(cacheKey(userId, providerId), {
		providerId,
		remainingRequests: rl.remainingRequests ?? null,
		remainingTokens: rl.remainingTokens ?? null,
		resetAt,
		recordedAt: Date.now(),
		source: statusCode >= 400 ? 'error' : 'success'
	});
}

function getCached(userId: number, providerId: string): CachedRateLimit | null {
	const key = cacheKey(userId, providerId);
	const entry = responseCache.get(key);
	if (!entry) return null;
	if (Date.now() >= entry.resetAt.getTime()) {
		responseCache.delete(key);
		return null;
	}
	return entry;
}

export class RateLimit {
	// In-memory state keyed by `${userId}:${providerId}`.
	#cache = new Map<string, CachedRateLimit>();

	constructor(private readonly db: AnyDb) {}

	// ─────────────────────────────────────────────────────────────────────
	// Pure logic (static, no instance state)
	// ─────────────────────────────────────────────────────────────────────

	static decideStrategy(
		cached: CachedRateLimit | null,
		attempt: number,
		maxAttempts: number
	): RetryStrategy {
		if (!cached) return { mode: 'inline', waitMs: 0, reason: 'no cached limit' };
		const waitMs = Math.max(0, cached.resetAt.getTime() - Date.now());
		if (waitMs === 0) return { mode: 'inline', waitMs: 0, reason: 'window reset' };
		if (waitMs < RATE_LIMIT_INLINE_THRESHOLD_MS) {
			return { mode: 'inline', waitMs, reason: `short cooldown (${waitMs}ms)` };
		}
		if (attempt >= maxAttempts) return { mode: 'fail', waitMs, reason: 'max attempts reached' };
		return { mode: 'surface', waitMs, reason: `long cooldown (${Math.ceil(waitMs / 1000)}s)` };
	}

	/**
	 * Wrap a `fetch` so the caller can observe every response's status +
	 * headers (rate-limit-aware). The wrapped fetch is a transparent
	 * pass-through; the AI SDK's response handlers will still throw
	 * APICallError on non-2xx responses with the headers attached.
	 */
	static createFetchWrapper(onResponse: (state: FetchResponse) => void): typeof fetch {
		return async (input, init) => {
			const response = await globalThis.fetch(input, init);
			const headers: Record<string, string> = {};
			response.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
			onResponse({
				providerId: '',
				headers,
				statusCode: response.status,
				url: String(input)
			});
			return response;
		};
	}

	// ─────────────────────────────────────────────────────────────────────
	// In-memory cache ops (per gateway instance, per-request lifetime)
	// ─────────────────────────────────────────────────────────────────────

	get(userId: number, providerId: string): CachedRateLimit | null {
		return getCached(userId, providerId);
	}

	set(userId: number, providerId: string, state: CachedRateLimit): void {
		responseCache.set(cacheKey(userId, providerId), state);
	}

	clear(userId?: number, providerId?: string): void {
		if (userId != null && providerId) {
			responseCache.delete(cacheKey(userId, providerId));
			return;
		}
		if (userId != null) {
			const prefix = `${userId}:`;
			for (const key of responseCache.keys()) {
				if (key.startsWith(prefix)) responseCache.delete(key);
			}
			return;
		}
		responseCache.clear();
	}

	isLimited(userId: number, providerId: string): boolean {
		return this.msUntilReset(userId, providerId) > 0;
	}

	msUntilReset(userId: number, providerId: string): number {
		const entry = this.get(userId, providerId);
		return entry ? Math.max(0, entry.resetAt.getTime() - Date.now()) : 0;
	}

	captureFromResponse(
		userId: number,
		providerId: string,
		statusCode: number,
		headers: Record<string, string>
	): void {
		captureToCache(userId, providerId, statusCode, headers);
	}

	requireOrThrow(
		userId: number,
		providerId: string,
		attempt: number,
		maxAttempts: number
	): RetryStrategy {
		const strategy = RateLimit.decideStrategy(this.get(userId, providerId), attempt, maxAttempts);
		if (strategy.mode === 'surface') {
			const cached = this.get(userId, providerId)!;
			throw new RateLimitError(
				providerId as ProviderId,
				Math.ceil(strategy.waitMs / 1000),
				cached.resetAt.toISOString()
			);
		}
		if (strategy.mode === 'fail') {
			throw new RateLimitError(providerId as ProviderId, null, null);
		}
		return strategy;
	}

	// ─────────────────────────────────────────────────────────────────────
	// DB persistence
	// ─────────────────────────────────────────────────────────────────────

	async record(userId: number, state: RateLimitState): Promise<void> {
		const windows: Array<{ key: string; limit: number | null; remaining: number | null; reset: string | null }> = [
			{
				key: 'requests_per_minute',
				limit: state.limitRequests,
				remaining: state.remainingRequests,
				reset: state.resetRequests
			},
			{
				key: 'tokens_per_minute',
				limit: state.limitTokens,
				remaining: state.remainingTokens,
				reset: state.resetTokens
			}
		];
		for (const w of windows) {
			if (w.limit == null) continue;
			const seconds = parseResetDuration(w.reset);
			if (seconds == null) continue;
			const recordedAtMs = new Date(state.recordedAt).getTime();
			if (Number.isNaN(recordedAtMs)) continue;
			const resetAt = new Date(recordedAtMs + seconds * 1000).toISOString();
			await this.db
				.insert(rateLimitState)
				.values({
					userId,
					providerId: state.providerId,
					modelId: state.modelId ?? null,
					window: w.key,
					limitValue: w.limit,
					remaining: w.remaining,
					resetAt,
					recordedAt: state.recordedAt
				})
				.onConflictDoUpdate({
					target: [rateLimitState.userId, rateLimitState.providerId, rateLimitState.modelId, rateLimitState.window],
					set: {
						limitValue: w.limit,
						remaining: w.remaining,
						resetAt,
						recordedAt: state.recordedAt
					}
				});
		}
	}

	async getActive(userId: number, providerId: string): Promise<RateLimitStateRow | null> {
		const rows = await this.db
			.select()
			.from(rateLimitState)
			.where(and(eq(rateLimitState.userId, userId), eq(rateLimitState.providerId, providerId)));
		const now = Date.now();
		let best: RateLimitStateRow | null = null;
		for (const row of rows) {
			if (new Date(row.resetAt).getTime() < now) continue;
			if (
				!best ||
				(row.remaining ?? 0) < (best.remaining ?? 0) ||
				new Date(row.resetAt) < new Date(best.resetAt)
			) {
				best = row;
			}
		}
		return best;
	}
}

/**
 * Factory the V2 resolver attaches to `OpenAICompatibleConfig.fetch`
 * (or `createDeepSeek({ fetch })`). Returns a `fetch` that:
 * 1. Forwards the request/response to the network.
 * 2. Captures `x-ratelimit-*` / `retry-after` headers on every response
 *    (success or error) and updates the per-(user, provider) in-memory
 *    cache.
 *
 * The cache is consulted by `RateLimit.requireOrThrow` (in
 * `agent-stream-retry.ts`) to decide whether to wait inline (short
 * cooldown) or surface a `RateLimitError` to the auto-retry loop
 * (long cooldown, which then emits the `data-rateLimit` stream part
 * for the client banner).
 *
 * The cache is process-local; it lives only for the lifetime of the
 * Node process. Cross-session history persists in the `rate_limit_state`
 * table via `RateLimit.record`.
 */
export function createRateLimitFetch(
	userId: number,
	providerId: string
): typeof fetch {
	return RateLimit.createFetchWrapper((state) => {
		try {
			captureToCache(userId, providerId, state.statusCode, state.headers);
		} catch (err) {
			console.warn('[createRateLimitFetch] capture failed:', err);
		}
	});
}
