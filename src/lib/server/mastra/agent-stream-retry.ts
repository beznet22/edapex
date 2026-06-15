/**
 * Shared `agent.stream(...)` retry wrapper.
 *
 * Wraps the call site in a bounded retry loop that only fires on
 * `RateLimitError`. Each retry:
 *   1. Emits a `data-rateLimit` stream part to the workflow writer so the
 *      client-side banner can show a live countdown.
 *   2. Waits the server-specified cooldown (NOT exponential backoff — the
 *      provider already told us exactly how long to wait via
 *      `retryAfterSeconds` / `resetAt`).
 *   3. Re-invokes the stream thunk to construct a fresh stream. The previous
 *      attempt's stream is dropped; mid-stream text-deltas already piped to
 *      the writer are visible to the client but the next attempt starts
 *      cleanly.
 *
 * Non-rate-limit errors short-circuit the loop. The caller's `AbortSignal`
 * is checked before each attempt and during the wait so a user-initiated
 * cancel propagates immediately as a standard DOM `AbortError` — the same
 * shape the assistant step's `onError` already recognises.
 */
import { RateLimitError } from '$lib/provider/errors';

export const MAX_RETRY_ATTEMPTS = 3;

export interface RateLimitPartData {
	providerId: string;
	retryAfterSeconds: number;
	resetAt: string;
	attempt: number;
	maxAttempts: number;
}

export interface StreamWriterLike {
	write: (chunk: unknown) => Promise<void>;
}

export async function streamWithAutoRetry<R>(opts: {
	stream: () => Promise<R>;
	abortSignal: AbortSignal | undefined;
	writer: StreamWriterLike;
}): Promise<R> {
	let lastErr: unknown;
	for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
		if (opts.abortSignal?.aborted) {
			throw new DOMException('Aborted', 'AbortError');
		}
		try {
			return await opts.stream();
		} catch (err) {
			lastErr = err;
			if (!(err instanceof RateLimitError)) throw err;

			const secs = err.retryAfterSeconds ?? 5;
			const resetAt = err.resetAt ?? new Date(Date.now() + secs * 1000).toISOString();
			const data: RateLimitPartData = {
				providerId: err.providerId,
				retryAfterSeconds: secs,
				resetAt,
				attempt,
				maxAttempts: MAX_RETRY_ATTEMPTS
			};

			await opts.writer
				.write({ type: 'data-rateLimit', id: `rl-${Date.now()}-${attempt}`, data } as never)
				.catch(() => {});

			if (opts.abortSignal?.aborted) throw new DOMException('Aborted', 'AbortError');
			await new Promise((r) => setTimeout(r, secs * 1000));
		}
	}
	throw lastErr;
}
