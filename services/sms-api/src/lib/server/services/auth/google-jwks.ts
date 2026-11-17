/**
 * Google's signing keys, cached.
 *
 * A key rotation is why the resolver refetches once on an unknown `kid`: tokens minted
 * minutes before a rotation carry the old id, and rejecting them would sign people out for
 * the length of our cache rather than for a real reason.
 */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const FALLBACK_MAX_AGE_SECONDS = 3600;

interface CacheEntry {
  readonly keys: readonly (JsonWebKey & { readonly kid?: string })[];
  readonly expiresAt: number;
}

let cache: CacheEntry | null = null;
let inFlight: Promise<CacheEntry> | null = null;

async function fetchKeys(nowSeconds: number): Promise<CacheEntry> {
  const response = await fetch(JWKS_URL);
  if (!response.ok) throw new Error(`Google keys returned ${response.status}`);
  const body = (await response.json()) as { keys?: unknown };
  const keys = Array.isArray(body.keys) ? (body.keys as CacheEntry["keys"]) : [];
  const maxAge = Number(response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 0);
  return {
    keys,
    expiresAt: nowSeconds + (Number.isFinite(maxAge) && maxAge > 0 ? maxAge : FALLBACK_MAX_AGE_SECONDS)
  };
}

export async function resolveGoogleKey(kid: string, nowSeconds: number): Promise<JsonWebKey | null> {
  const fresh = cache !== null && cache.expiresAt > nowSeconds;
  if (!fresh) {
    inFlight ??= fetchKeys(nowSeconds).finally(() => {
      inFlight = null;
    });
    cache = await inFlight;
  }

  const found = cache?.keys.find((key) => key.kid === kid) ?? null;
  if (found !== null) return found;

  // Unknown key id: probably a rotation. Refetch once, bypassing the cache.
  cache = await fetchKeys(nowSeconds);
  return cache.keys.find((key) => key.kid === kid) ?? null;
}
