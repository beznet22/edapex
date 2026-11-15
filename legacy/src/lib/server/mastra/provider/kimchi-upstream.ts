/**
 * Kimchi upstream header sync.
 *
 * The Kimchi gateway requires a versioned `User-Agent` plus session-scoped
 * headers (`X-Session-Id`, `X-Turn-Index`). Hardcoding the version works, but
 * it drifts whenever the upstream CLI (`https://github.com/getkimchi/kimchi`)
 * ships a new release. This module fetches the current version from the
 * upstream `package.json` and overlays it onto a static header template.
 *
 * Header names are intentionally static fallbacks: the upstream CLI sets
 * `User-Agent` in `src/cli.ts` and `X-Session-Id` / `X-Turn-Index` in
 * `src/extensions/telemetry/index.ts`. If upstream ever rotates a name, the
 * static defaults below remain correct for the current gateway contract and
 * can be updated in one place.
 *
 * Failure mode:
 *   - If GitHub is unreachable, the static defaults below are used and a
 *     single warning is logged. Tests do not depend on network access.
 *
 * Cache strategy:
 *   - Module-scope in-memory cache keyed by the source URL.
 *   - TTL: 24 hours. Mirrors the Kimchi CLI's own `VERSION_GITHUB_TTL_MS`.
 *   - Concurrent callers during a refresh share the same in-flight Promise.
 */

const KIMCHI_REPO = 'https://raw.githubusercontent.com/getkimchi/kimchi/master';
const VERSION_SOURCE_PATH = 'package.json';
const UPSTREAM_URL = `${KIMCHI_REPO}/${VERSION_SOURCE_PATH}`;
const TTL_MS = 86_400_000; // 24h
const FETCH_TIMEOUT_MS = 5_000;

/**
 * Static fallback. Matches the upstream CLI's expected headers at the time
 * this module was written; tests assert against these exact strings.
 *
 * `__KIMCHI_SESSION_ID__` and `__KIMCHI_TURN_INDEX__` are placeholders that
 * the dynamic header resolver replaces with per-request values.
 */
export const STATIC_KIMCHI_HEADERS: Readonly<Record<string, string>> = Object.freeze({
	'User-Agent': 'kimchi/dev',
	'X-Session-Id': '__KIMCHI_SESSION_ID__',
	'X-Turn-Index': '__KIMCHI_TURN_INDEX__'
});

interface CachedHeaders {
	readonly headers: Record<string, string>;
	readonly fetchedAt: number;
	readonly fromUpstream: boolean;
}

let cache: CachedHeaders | null = null;
let inflight: Promise<CachedHeaders> | null = null;
let upstreamWarningLogged = false;

async function fetchVersionFromUpstream(): Promise<string | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		const res = await fetch(UPSTREAM_URL, {
			signal: controller.signal,
			headers: { Accept: 'application/json' }
		});
		if (!res.ok) {
			throw new Error(`upstream HTTP ${res.status}`);
		}
		const data = (await res.json()) as { version?: unknown };
		if (typeof data.version === 'string' && data.version.length > 0) {
			return data.version;
		}
		return null;
	} finally {
		clearTimeout(timer);
	}
}

function resolveUserAgent(version: string): string {
	// The real CLI's getVersion() maps "0.0.0" → "dev".
	const display = version === '0.0.0' ? 'dev' : version;
	return `kimchi/${display}`;
}

async function refresh(): Promise<CachedHeaders> {
	let version: string | null = null;
	try {
		version = await fetchVersionFromUpstream();
	} catch (err) {
		if (!upstreamWarningLogged) {
			console.warn('[kimchi-upstream] version fetch failed; using static defaults', {
				url: UPSTREAM_URL,
				error: err instanceof Error ? err.message : String(err)
			});
			upstreamWarningLogged = true;
		}
		// Fall through to static defaults below.
	}

	if (version) {
		return {
			headers: {
				...STATIC_KIMCHI_HEADERS,
				'User-Agent': resolveUserAgent(version)
			},
			fetchedAt: Date.now(),
			fromUpstream: true
		};
	}

	if (!upstreamWarningLogged) {
		console.warn('[kimchi-upstream] could not resolve upstream version; using static defaults', {
			url: UPSTREAM_URL
		});
		upstreamWarningLogged = true;
	}
	return {
		headers: { ...STATIC_KIMCHI_HEADERS },
		fetchedAt: Date.now(),
		fromUpstream: false
	};
}

/**
 * Returns the current Kimchi request header template, overlay'd from the
 * upstream CLI version when available. Safe to call from any server context;
 * never throws — falls back to static defaults if anything goes wrong with
 * the upstream sync.
 */
export async function getKimchiHeaders(): Promise<Record<string, string>> {
	try {
		const stale = cache && Date.now() - cache.fetchedAt > TTL_MS;
		if (!cache) {
			if (!inflight) {
				inflight = refresh().then((c) => {
					cache = c;
					inflight = null;
					return c;
				});
			}
			const result = await inflight;
			return { ...result.headers };
		}
		if (stale && !inflight) {
			// Fire-and-forget refresh; keep the cached headers for this caller.
			inflight = refresh()
				.then((c) => {
					cache = c;
					inflight = null;
					return c;
				})
				.catch(() => {
					inflight = null;
				}) as Promise<CachedHeaders>;
		}
		return { ...cache.headers };
	} catch (err) {
		// Defensive last-resort: never let an upstream hiccup break model resolution.
		if (!upstreamWarningLogged) {
			console.warn('[kimchi-upstream] resolver fallback to static defaults', {
				error: err instanceof Error ? err.message : String(err)
			});
			upstreamWarningLogged = true;
		}
		return { ...STATIC_KIMCHI_HEADERS };
	}
}

/**
 * Test-only: reset the cache. Never call from production code.
 */
export function __resetKimchiCache(): void {
	cache = null;
	inflight = null;
	upstreamWarningLogged = false;
}
