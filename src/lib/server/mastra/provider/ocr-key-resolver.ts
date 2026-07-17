/**
 * OCR key resolution — single source of truth for resolving the Mistral
 * API key used by the OCR pipeline.
 *
 * Resolution order (same as the chat-side 4-tier router):
 *   1. User's stored personal credential in `encrypted_credentials`
 *      (decrypted with the school encryption key). Only used if the
 *      credential is enabled.
 *   2. School pool donation (tier 2). Looks up the school's active
 *      donation for the Mistral provider. Gated by potluck_config
 *      (enabled flag, consumerRoles allowlist).
 *      Only consulted when `schoolId` is provided.
 *   3. Platform env var `MISTRAL_API_KEY`.
 *
 * Used by both `mistral-ocr.service.ts` (single-document OCR) and
 * `ocr-batch.service.ts` (batch OCR) so the fallback chain stays in
 * lock-step across both services.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { env as defaultEnv } from '$env/dynamic/private';
import type { ProviderId } from '$lib/provider/types';
import { getUserCredential, resolveApiKeyForCredential } from './credentials';
import { decrypt, getEncryptionKey } from './crypto';
import { DecryptionError } from '$lib/provider/errors';
import {
	findActiveDonationForProvider,
	parseJsonArray
} from './potluck';
import { getCachedPotluckConfig } from './cache';

const MISTRAL_PROVIDER_ID = 'mistral' as ProviderId;

export interface ResolveMistralKeyParams {
	db: LibSQLDatabase<any>;
	userId: number;
	/** School scope. When null, the pool tier is skipped. */
	schoolId: number | null;
	/** User role string (e.g. 'class_teacher'). When null, the pool tier
	 *  is skipped if the school's consumerRoles allowlist is non-empty. */
	userRole?: string | null;
	env?: Record<string, string | undefined>;
}

export async function resolveMistralApiKey(params: ResolveMistralKeyParams): Promise<string> {
	const e = params.env ?? (defaultEnv as Record<string, string | undefined>);

	// Tier 1: user personal credential
	const cred = await getUserCredential(params.db, e, params.userId, MISTRAL_PROVIDER_ID);
	if (cred?.enabled === 1) {
		const key = resolveApiKeyForCredential(cred, e, MISTRAL_PROVIDER_ID);
		if (key) return key;
	}

	// Tier 2: school pool donation. Only consultable when we have a school
	// scope. Skipped silently when the pool is disabled, the role isn't
	// allowed, or the provider isn't allowed.
	if (params.schoolId !== null && params.schoolId !== undefined) {
		const poolKey = await resolvePoolKey({
			db: params.db,
			env: e,
			schoolId: params.schoolId,
			userRole: params.userRole ?? null
		});
		if (poolKey) return poolKey;
	}

	// Tier 3: platform env fallback
	const envKey = e.MISTRAL_API_KEY;
	if (!envKey) {
		throw new Error(
			'MISTRAL_API_KEY is not configured. Connect a Mistral key in Settings → Providers, contribute to the school pool, or set MISTRAL_API_KEY in the environment.'
		);
	}
	return envKey;
}

async function resolvePoolKey(args: {
	db: LibSQLDatabase<any>;
	env: Record<string, string | undefined>;
	schoolId: number;
	userRole: string | null;
}): Promise<string | null> {
	const cfg = await getCachedPotluckConfig(args.db, args.schoolId);
	if (!cfg || cfg.enabled !== 1) return null;

	const consumerRoles = parseJsonArray(cfg.consumerRoles);
	if (
		consumerRoles.length > 0 &&
		(args.userRole === null || !consumerRoles.includes(args.userRole))
	) {
		return null;
	}

	const allowedProviders = parseJsonArray(cfg.allowedProviders);
	if (
		allowedProviders.length > 0 &&
		!allowedProviders.includes(MISTRAL_PROVIDER_ID)
	) {
		return null;
	}

	const donation = await findActiveDonationForProvider(
		args.db,
		args.env,
		args.schoolId,
		MISTRAL_PROVIDER_ID
	);
	if (!donation) return null;

	try {
		return decrypt(donation.apiKeyEncrypted, getEncryptionKey(args.env));
	} catch (err) {
		if (!(err instanceof DecryptionError)) {
			console.error(
				`[ocr-key-resolver] unexpected decrypt failure for ${MISTRAL_PROVIDER_ID}:`,
				err
			);
		}
		return null;
	}
}
