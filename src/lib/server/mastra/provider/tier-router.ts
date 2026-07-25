/**
 * 4-tier pot-luck router.
 *
 * Walks the tiers in this strict order on every request:
 *   Tier 1 — Personal credential (encrypted_credentials row with
 *            credential_kind=personal, enabled === 1, has key).
 *   Tier 2 — Pot-Luck pool (encrypted_credentials rows with
 *            credential_kind=donation, gated by potluck_config.enabled,
 *            user role in consumerRoles, provider in the
 *            provider_access_policy allow list, and per-user daily cap
 *            not exceeded).
 *   Tier 3 — Platform env key (e.g. GROQ_API_KEY).
 *   Tier 4 — Structured error with the full tier trace.
 *
 * The router is the canonical request-time key resolver. The trace is
 * preserved on the resolved object so downstream error surfaces
 * (audit-log writers, UI error banners) can render why each tier failed.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import type { ProviderId } from './types';
import {
	findActiveDonationForProvider,
	getPotluckConfig,
	parseJsonArray
} from './potluck';
import { PLATFORM_ENV_KEYS, resolveApiKeyForCredential, getUserCredential } from './credentials';
import { listAdminOverrides } from './admin-model-overrides';
import { getCachedUserCredential, getCachedPotluckConfig } from './cache';
import { decrypt, getEncryptionKey } from './crypto';
import { DecryptionError } from '$lib/provider/errors';
import { log } from '$lib/server/audit-log';

export type TierNumber = 1 | 2 | 3 | 4;

export type TierStatus = 'served' | 'skipped' | 'failed';

export interface TierTrace {
	tier: TierNumber;
	status: TierStatus;
	reason?: string;
	source?: 'user' | 'pool' | 'env';
}

export interface ResolvedProviderKeyWithTrace {
	apiKey: string;
	source: 'user' | 'pool' | 'env';
	tier: TierNumber;
	credentialEnabled: boolean | null;
	trace: TierTrace[];
}

/**
 * Structured error thrown when all four tiers fail. Carries the full trace
 * so callers can decide whether to surface it, write it to the audit log,
 * or return a 502 to the client.
 */
export class AllTiersFailedError extends Error {
	readonly trace: TierTrace[];
	readonly providerId: ProviderId;
	constructor(providerId: ProviderId, trace: TierTrace[]) {
		super(
			`No credential available for provider ${providerId} after walking ${trace.length} tier(s)`
		);
		this.name = 'AllTiersFailedError';
		this.providerId = providerId;
		this.trace = trace;
	}
}

async function tryTier1Personal(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId
): Promise<{ result: { apiKey: string; credentialEnabled: boolean } | null; trace: TierTrace }> {
	let credential: Awaited<ReturnType<typeof getCachedUserCredential>> | null = null;
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			credential = await getCachedUserCredential(db, env, userId, providerId);
			break;
		} catch (err) {
			if (attempt === 0) {
				console.warn(
					`[tier-router] tier1 DB query failed (attempt ${attempt + 1}/2)`,
					{ userId, providerId, error: err instanceof Error ? err.message : String(err) }
				);
				await new Promise((r) => setTimeout(r, 200));
				continue;
			}
			return {
				result: null,
				trace: { tier: 1, status: 'failed', reason: 'db_error' }
			};
		}
	}
	if (!credential) {
		console.debug(`[tier-router] tier1: no credential for user=${userId} provider=${providerId}`);
		return {
			result: null,
			trace: {
				tier: 1,
				status: 'skipped',
				reason: 'no_user_credential'
			}
		};
	}
	if (credential.enabled !== 1) {
		console.debug(`[tier-router] tier1: credential disabled for user=${userId} provider=${providerId}`);
		return {
			result: { apiKey: '', credentialEnabled: false as const },
			trace: {
				tier: 1,
				status: 'skipped',
				reason: 'credential_disabled'
			}
		};
	}
	const apiKey = resolveApiKeyForCredential(credential, env, providerId);
	if (!apiKey) {
		console.warn(
			`[tier-router] tier1: empty_api_key for user=${userId} provider=${providerId} — key decryption returned empty`
		);
		return {
			result: null,
			trace: { tier: 1, status: 'failed', reason: 'empty_api_key' }
		};
	}
	console.debug(
		`[tier-router] tier1: served user key for user=${userId} provider=${providerId}`,
		{ fingerprint: `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}` }
	);
	return {
		result: { apiKey, credentialEnabled: true },
		trace: { tier: 1, status: 'served', source: 'user' }
	};
}

async function tryTier2Pool(args: {
	db: LibSQLDatabase<any>;
	env: Record<string, string | undefined>;
	schoolId: number | null;
	userRole: string | null;
	userId: number;
	providerId: ProviderId;
	todayTokenUsage: number;
}): Promise<{ result: { apiKey: string } | null; trace: TierTrace }> {
	const { db, env, schoolId, userRole, userId, providerId, todayTokenUsage } = args;

	// Pool is school-scoped; without a school context there is nothing to query.
	if (schoolId === null) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'no_school_context' }
		};
	}

	// Pool is gated by config + role + provider allowlist + quota. Each
	// gate adds a distinct reason so the audit log explains exactly why
	// the pool tier was skipped.
	const cfg = await getCachedPotluckConfig(db, schoolId);
	if (!cfg || cfg.enabled !== 1) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: cfg === null ? 'no_config' : 'disabled' }
		};
	}
	const consumerRoles = parseJsonArray(cfg.consumerRoles);
	if (consumerRoles.length > 0 && userRole !== null && !consumerRoles.includes(userRole)) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'role_not_allowed' }
		};
	}
	const allowedProviders = parseJsonArray(cfg.allowedProviders);
	if (
		allowedProviders.length > 0 &&
		!allowedProviders.includes(providerId)
	) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'provider_not_allowed' }
		};
	}
	if (
		cfg.perUserDailyTokenCap > 0 &&
		todayTokenUsage >= cfg.perUserDailyTokenCap
	) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'quota_exceeded' }
		};
	}

	// Check admin denylist: if the provider is admin-disabled, tier 2
	// can never serve it. (The same denylist filters availableModels at
	// the UI layer, but the router enforces it server-side too.)
	const overrides = await listAdminOverrides(db, schoolId);
	const providerBlocked = overrides.some(
		(row) => row.providerId === providerId && row.modelId === null
	);
	if (providerBlocked) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'provider_admin_disabled' }
		};
	}

	const donation = await findActiveDonationForProvider(db, env, schoolId, providerId);
	if (!donation) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'no_active_donation' }
		};
	}
	// ToS version enforcement: the donated key is only usable while its
	// recorded ToS version matches the school's current config. A mismatch
	// means the donor must re-accept the updated terms before the pool
	// tier can serve this provider.
	if (cfg.tosVersion && donation.tosVersion !== cfg.tosVersion) {
		return {
			result: null,
			trace: { tier: 2, status: 'skipped', reason: 'tos_version_mismatch' }
		};
	}
	const encryptionKey = getEncryptionKey(env);
	let decrypted: string;
	try {
		decrypted = decrypt(donation.apiKeyEncrypted, encryptionKey);
	} catch (err) {
		// DecryptionError (typed) is the expected failure mode for a
		// corrupted donation row. Anything else is unexpected and
		// surfaces through the same trace reason so audit-log readers
		// don't need to distinguish.
		if (!(err instanceof DecryptionError)) {
			console.error(
				`[tier-router] unexpected decrypt failure for ${providerId}:`,
				err
			);
		}
		return {
			result: null,
			trace: { tier: 2, status: 'failed', reason: 'decryption_failed' }
		};
	}
	// The user's own id is encoded in the audit-log so consumer attribution
	// can be recovered, but we don't surface it on the trace.
	void userId;
	const parsed = JSON.parse(decrypted) as { apiKey: string };
	return {
		result: { apiKey: parsed.apiKey },
		trace: { tier: 2, status: 'served', source: 'pool' }
	};
}

function tryTier3Platform(
	env: Record<string, string | undefined>,
	providerId: ProviderId,
	credentialEnabled: boolean | null
): { result: { apiKey: string } | null; trace: TierTrace } {
	const envKey = PLATFORM_ENV_KEYS[providerId];
	const envValue = envKey ? env[envKey] : undefined;
	if (!envValue) {
		return {
			result: null,
			trace: { tier: 3, status: 'skipped', reason: 'env_key_missing' }
		};
	}
	return {
		result: { apiKey: envValue },
		trace: {
			tier: 3,
			status: 'served',
			source: 'env',
			reason: credentialEnabled === false ? 'personal_disabled' : undefined
		}
	};
}

export interface ResolveArgs {
	db: LibSQLDatabase<any>;
	env: Record<string, string | undefined>;
	userId: number;
	providerId: ProviderId;
	schoolId: number | null;
	userRole: string | null;
	todayTokenUsage?: number;
	/**
	 * Optional. When provided AND a number, the router writes one
	 * `data/audit-log/{schoolId}.jsonl` entry per call recording which
	 * tier served (or that all tiers failed) plus the full trace. The
	 * entry never contains plaintext keys or passphrases.
	 */
	auditStaffId?: number | null;
	auditActor?: number | null;
}

/**
 * Resolve the effective API key for a user × provider. Walks all four
 * tiers; returns the resolved key + tier trace on success, or throws
 * `AllTiersFailedError` with the trace on failure.
 */
export async function resolveProviderKeyWithTrace(
	args: ResolveArgs
): Promise<ResolvedProviderKeyWithTrace> {
	const { db, env, userId, providerId, schoolId, userRole } = args;
	const todayTokenUsage = args.todayTokenUsage ?? 0;
	const startMs = Date.now();

	const tier1 = await tryTier1Personal(db, env, userId, providerId);
	if (tier1.result) {
		const elapsed = Date.now() - startMs;
		const resolved = {
			apiKey: tier1.result.apiKey,
			source: 'user' as const,
			tier: 1 as const,
			credentialEnabled: tier1.result.credentialEnabled,
			trace: [tier1.trace]
		};
		console.debug(`[tier-router] resolved user=${userId} provider=${providerId} tier=1 source=user duration=${elapsed}ms`);
		await maybeWriteAuditLog(args, resolved);
		return resolved;
	}

	// STRICT tier 1: if the user has a credential but the stored key is
	// empty/broken, do NOT fall through to tier 2 (pool) or tier 3 (env).
	// The user explicitly chose to provide their own key — silently
	// routing through a pool donation or the platform env key would
	// (a) misattribute the request and (b) leave the user unaware that
	// their own key is broken. Surface a NoCredentialError so the chat
	// pipeline can render "Your key is invalid — update it in Settings."
	if (tier1.trace.reason === 'empty_api_key') {
		const elapsed = Date.now() - startMs;
		console.warn(`[tier-router] all-tiers-failed user=${userId} provider=${providerId} reason=empty_api_key duration=${elapsed}ms`);
		const trace = [tier1.trace];
		await maybeWriteAuditLog(args, null, trace);
		throw new AllTiersFailedError(providerId, trace);
	}

	const tier2 = await tryTier2Pool({
		db,
		env,
		schoolId,
		userRole,
		userId,
		providerId,
		todayTokenUsage
	});
	if (tier2.result) {
		const elapsed = Date.now() - startMs;
		console.debug(`[tier-router] resolved user=${userId} provider=${providerId} tier=2 source=pool duration=${elapsed}ms`);
		const resolved = {
			apiKey: tier2.result.apiKey,
			source: 'pool' as const,
			tier: 2 as const,
			credentialEnabled: null,
			trace: [tier1.trace, tier2.trace]
		};
		await maybeWriteAuditLog(args, resolved);
		return resolved;
	}

	const tier3 = tryTier3Platform(env, providerId, null);
	if (tier3.result) {
		const elapsed = Date.now() - startMs;
		console.debug(`[tier-router] resolved user=${userId} provider=${providerId} tier=3 source=env duration=${elapsed}ms`);
		const resolved = {
			apiKey: tier3.result.apiKey,
			source: 'env' as const,
			tier: 3 as const,
			credentialEnabled: null,
			trace: [tier1.trace, tier2.trace, tier3.trace]
		};
		await maybeWriteAuditLog(args, resolved);
		return resolved;
	}

	const elapsed = Date.now() - startMs;
	const trace = [tier1.trace, tier2.trace, tier3.trace];
	console.error(
		`[tier-router] all-tiers-failed user=${userId} provider=${providerId} duration=${elapsed}ms`,
		{ trace }
	);
	await maybeWriteAuditLog(args, null, trace);
	throw new AllTiersFailedError(providerId, trace);
}

async function maybeWriteAuditLog(
	args: ResolveArgs,
	resolved: ResolvedProviderKeyWithTrace | null,
	failedTrace?: TierTrace[]
): Promise<void> {
	const actor = typeof args.auditStaffId === 'number' ? args.auditStaffId : args.auditActor;
	if (typeof actor !== 'number') return;
	if (args.schoolId === null) return;
	if (resolved) {
		await log({
			schoolId: args.schoolId,
			actorStaffId: actor,
			action: 'access',
			entityType: 'providerKey',
			entityId: `${args.userId}:${args.providerId}`,
			before: { requested: true },
			after: {
				tier: resolved.tier,
				source: resolved.source,
				trace: resolved.trace
			}
		});
		return;
	}
	if (failedTrace) {
		await log({
			schoolId: args.schoolId,
			actorStaffId: actor,
			action: 'access',
			entityType: 'providerKey',
			entityId: `${args.userId}:${args.providerId}`,
			before: { requested: true },
			after: { tier: 4, source: null, trace: failedTrace }
		});
	}
}
