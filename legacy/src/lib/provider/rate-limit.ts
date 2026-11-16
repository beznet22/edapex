/**
 * Rate-limit types + pure parsers (client-safe).
 *
 * Source of truth for what rate-limit info we extract from upstream
 * provider response headers. Pure data — safe to import in both browser
 * and server contexts.
 */
import { z } from 'zod';

export const RateLimitStateSchema = z.object({
	providerId: z.string(),
	modelId: z.string().optional(),
	limitRequests: z.number().int().nullable(),
	limitTokens: z.number().int().nullable(),
	remainingRequests: z.number().int().nullable(),
	remainingTokens: z.number().int().nullable(),
	resetRequests: z.string().nullable(),
	resetTokens: z.string().nullable(),
	retryAfterSeconds: z.number().int().nullable(),
	recordedAt: z.string()
});
export type RateLimitState = z.infer<typeof RateLimitStateSchema>;

/**
 * Parse a duration string like '2m59.56s', '6m0s', '1h30m', or plain
 * seconds into total seconds. Returns null if the string cannot be parsed.
 */
export function parseResetDuration(raw: string | null | undefined): number | null {
	if (!raw) return null;
	const trimmed = raw.trim();
	const direct = Number(trimmed);
	if (!Number.isNaN(direct) && direct >= 0) return Math.round(direct);
	const match = trimmed.match(/^(?:(\d+)h)?(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/);
	if (!match) return null;
	const [, h, m, s] = match;
	if (!h && !m && !s) return null;
	return Math.round((Number(h ?? 0) * 3600) + (Number(m ?? 0) * 60) + Number(s ?? 0));
}

/**
 * Extract rate-limit info from a response headers map. Case-insensitive
 * matching on the `x-ratelimit-*` family + `retry-after`.
 */
export function extractRateLimitFromHeaders(
	providerId: string,
	headers: Record<string, string> | undefined
): Partial<RateLimitState> {
	if (!headers) return {};
	const lc: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) lc[k.toLowerCase()] = v;
	const num = (s: string | undefined): number | null => (s ? Number(s) : null);
	return {
		providerId,
		limitRequests: num(lc['x-ratelimit-limit-requests']),
		limitTokens: num(lc['x-ratelimit-limit-tokens']),
		remainingRequests: num(lc['x-ratelimit-remaining-requests']),
		remainingTokens: num(lc['x-ratelimit-remaining-tokens']),
		resetRequests: lc['x-ratelimit-reset-requests'] ?? null,
		resetTokens: lc['x-ratelimit-reset-tokens'] ?? null,
		retryAfterSeconds: num(lc['retry-after'])
	};
}
