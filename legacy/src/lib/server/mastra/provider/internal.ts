/**
 * Provider module — internal barrel (server-only).
 *
 * Re-exports the infrastructure that supports the public surface in
 * `index.ts` (rate-limit fetch, request-scoped cache, resolver tracing,
 * discovery backoff, and the 4-tier router helpers). Callers outside
 * the provider directory should not import from here directly; the
 * public barrel covers the contract surface, and `$lib/provider/errors`
 * covers the typed error classes.
 *
 * If you find yourself adding a new export here, ask: "is this part of
 * the contract?" If yes, move it to `index.ts`. If no, keep it inside
 * its own submodule and only re-export it here for sibling modules.
 */
export { RateLimit, createRateLimitFetch, RATE_LIMIT_INLINE_THRESHOLD_MS } from './rate-limit';

export { encrypt, decrypt, maskKey } from './crypto';

export {
	resolveProviderKeyWithTrace,
	AllTiersFailedError,
	type ResolvedProviderKeyWithTrace,
	type TierTrace,
	type TierNumber,
	type TierStatus,
	type ResolveArgs
} from './tier-router';

export {
	runWithCache,
	getRequestCache,
	getCachedUserCredential,
	getCachedHiddenModelIdsForUser,
	getCachedPotluckConfig,
	invalidateCachedCredential,
	invalidateCachedPotluckConfig,
	invalidateCachedVisibility,
	type RequestCache
} from './cache';

export {
	withResolverTrace,
	type ResolverTrace,
	type ResolverTraceContext,
	type ResolverOutcome,
	type ResolverScope,
	type TraceableResolution
} from './trace';

export {
	withExponentialBackoff,
	DISCOVERY_ATTEMPTS,
	DISCOVERY_BACKOFF_BASE_MS,
	DISCOVERY_BACKOFF_MAX_MS,
	DISCOVERY_TIMEOUT_MS,
	type BackoffOptions
} from './discovery';

export { ensureProviderSchema, type RequiredProviderTable } from './schema';
