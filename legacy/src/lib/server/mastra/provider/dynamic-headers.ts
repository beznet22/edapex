/**
 * Dynamic per-request header registry.
 *
 * `@ai-sdk/openai-compatible` only accepts static headers at factory creation
 * time. To inject headers that change per request (e.g. a versioned
 * `User-Agent`), they have to flow through the custom `fetch` wrapper
 * (`createRateLimitFetch`) which is the one per-request seam.
 *
 * This module is the single point of extension. Any provider that needs a
 * header value computed at request time registers a resolver in
 * `HEADER_RESOLVERS`; the fetch wrapper calls `resolveDynamicHeaders(providerId, env)`
 * before forwarding each outbound request.
 */
import type { ProviderId } from '$lib/provider/types';
import { getKimchiHeaders, __resetKimchiCache as resetKimchiUpstreamCache } from './kimchi-upstream';

export type HeaderResolver = (
	env: Record<string, string | undefined>
) => Promise<Record<string, string>>;

// ─── Kimchi header resolver ────────────────────────────────────────────────

/**
 * Resolve the full header set for the Kimchi provider.
 *
 * Fetches the upstream CLI's header template (versioned `User-Agent` plus
 * placeholders for session-scoped headers) and materialises the per-request
 * values:
 *   - `X-Session-Id` → cryptographically random UUID v4
 *   - `X-Turn-Index` → `"0"` (sentinel for the first turn)
 *
 * The upstream sync never throws; if GitHub is unreachable the static
 * fallback from `kimchi-upstream.ts` is used.
 */
async function resolveKimchiHeaders(
	env: Record<string, string | undefined>
): Promise<Record<string, string>> {
	const upstream = await getKimchiHeaders();

	// Allow tests to pin the version via KIMCHI_VERSION without hitting GitHub.
	const versionOverride = env.KIMCHI_VERSION;
	if (versionOverride) {
		upstream['User-Agent'] = `kimchi/${versionOverride}`;
	}

	const headers: Record<string, string> = {};
	for (const [key, value] of Object.entries(upstream)) {
		headers[key] = value;
	}

	if (headers['X-Session-Id'] === '__KIMCHI_SESSION_ID__') {
		headers['X-Session-Id'] = crypto.randomUUID();
	}
	if (headers['X-Turn-Index'] === '__KIMCHI_TURN_INDEX__') {
		headers['X-Turn-Index'] = '0';
	}

	return headers;
}

// ─── Registry ──────────────────────────────────────────────────────────────

export const HEADER_RESOLVERS: Partial<Record<ProviderId, HeaderResolver>> = {
	kimchi: resolveKimchiHeaders
};

/**
 * Resolve dynamic headers for the given provider. Returns an empty object
 * when no resolver is registered, which lets the fetch wrapper treat
 * unregistered providers as a no-op.
 */
export async function resolveDynamicHeaders(
	providerId: ProviderId,
	env: Record<string, string | undefined>
): Promise<Record<string, string>> {
	const resolver = HEADER_RESOLVERS[providerId];
	if (!resolver) return {};
	return resolver(env);
}

/**
 * Test seam to reset module-level caches.
 *
 * Resets the upstream Kimchi cache so tests can observe fresh fetches or
 * pin values via `env.KIMCHI_VERSION`.
 */
export function resetKimchiVersionCache(): void {
	resetKimchiUpstreamCache();
}
