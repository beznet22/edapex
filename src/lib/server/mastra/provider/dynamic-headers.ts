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
 *
 * Caching strategy mirrors the kimchi CLI's `resolveVersion` flow:
 *   1. Explicit env override
 *   2. Module-level in-memory cache (24h TTL)
 *   3. Network fetch (GitHub raw package.json)
 *   4. Hard-coded fallback
 *
 * The module-level cache survives across requests because the deployment
 * topology (`@sveltejs/adapter-node` + Bun) runs a single long-lived process,
 * consistent with the existing `_sharedStorage`, `authRepo`, and
 * `responseCache` singletons in this codebase.
 */
import type { ProviderId } from '$lib/provider/types';

export type HeaderResolver = (
	env: Record<string, string | undefined>
) => Promise<Record<string, string>>;

// ─── Kimchi version cache ──────────────────────────────────────────────────

interface VersionCacheEntry {
	version: string;
	fetchedAt: number;
}

const KIMCHI_VERSION_TTL_MS = 86_400_000; // 24h, matches the CLI's VERSION_GITHUB_TTL_MS

// Module-level singleton. Wrapped in an object so the property is mutable
// without a const cast; consistent with `_sharedStorage`, `authRepo`, and
// `responseCache` patterns elsewhere in this codebase.
const kimchiVersionCache: { current: VersionCacheEntry | null } = { current: null };

/** Test seam to reset module-level cache. */
export function resetKimchiVersionCache(): void {
	kimchiVersionCache.current = null;
}

/**
 * Resolve the kimchi CLI version to embed in `User-Agent`.
 *
 * Precedence:
 *   1. `KIMCHI_VERSION` env var (explicit override)
 *   2. Module-level in-memory cache (24h TTL)
 *   3. GitHub fetch: `raw.githubusercontent.com/getkimchi/kimchi/master/package.json`
 *   4. Hard-coded fallback `'0.0.0'`
 *
 * The returned value is the bare version (e.g. `'0.5.0'` or `'dev'`). Callers
 * wrap it with the `kimchi/` prefix.
 */
async function resolveKimchiVersion(env: Record<string, string | undefined>): Promise<string> {
	const override = env.KIMCHI_VERSION;
	if (override) return override;

	const cached = kimchiVersionCache.current;
	if (cached && Date.now() - cached.fetchedAt < KIMCHI_VERSION_TTL_MS) {
		return cached.version;
	}

	try {
		const res = await fetch(
			'https://raw.githubusercontent.com/getkimchi/kimchi/master/package.json'
		);
		if (res.ok) {
			const data = (await res.json()) as { version?: unknown };
			if (typeof data.version === 'string' && data.version.length > 0) {
				kimchiVersionCache.current = { version: data.version, fetchedAt: Date.now() };
				return data.version;
			}
		}
	} catch {
		// Network failure: fall through to the hard-coded default.
	}

	return '0.0.0';
}

/**
 * Build the full `User-Agent` string for the kimchi provider.
 *
 * `kimchi/<version>` when a real version is available, `kimchi/dev` when the
 * upstream reports `'0.0.0'` (matching the CLI's own `getVersion()` mapping
 * at `kimchi-mimic.ts:resolveUserAgent`).
 */
async function resolveKimchiUserAgent(
	env: Record<string, string | undefined>
): Promise<Record<string, string>> {
	const version = await resolveKimchiVersion(env);
	const display = version === '0.0.0' ? 'dev' : version;
	return { 'User-Agent': `kimchi/${display}` };
}

// ─── Registry ──────────────────────────────────────────────────────────────

export const HEADER_RESOLVERS: Partial<Record<ProviderId, HeaderResolver>> = {
	kimchi: resolveKimchiUserAgent
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
