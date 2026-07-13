/**
 * Per-user model availability — V3.
 *
 * Returns only models that have been discovered via a provider's `/models`
 * endpoint (no static catalog fallback). Sources:
 * - User-connected credentials: discoveries stored on the credential row.
 * - Platform (env-backed) providers: discoveries cached in
 *   `platform_provider_discoveries`. A provider that is admin-disabled
 *   platform-wide (`admin_model_overrides` with `modelId = null`) is
 *   skipped entirely unless the user has connected their own key, which
 *   overrides the platform decision.
 *
 * Used by the model selector and the SSR auto-pick.
 */
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { encryptedCredentials } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { AugmentedModelInfo } from '$lib/provider/spec';
import type { ModelInfo } from '$lib/provider/spec';
import type { ProviderId } from '$lib/provider/types';
import { BUILTIN_MODELS } from '$lib/provider/catalog';
import {
	getCachedPlatformProviderModels,
	getDiscoveredModelsForUser
} from './discovery';
import { getCachedHiddenModelIdsForUser } from './cache';
import { applyAdminDenylist, listAdminOverrides } from './admin-model-overrides';
import { PLATFORM_ENV_KEYS } from './credentials';

export type { AugmentedModelInfo } from '$lib/provider/spec';

/**
 * Returns every discovered model for a user across user credentials AND
 * platform providers, without applying the user-hidden or admin-denylist
 * filters. Used by the Settings → Models tab so users can re-enable
 * models they previously hid. The model selector continues to use
 * `getAvailableModelsForUser` for its filtered view.
 */
export async function getAllDiscoveredModelsForSettings(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	schoolId: number = 1
): Promise<AugmentedModelInfo[]> {
	const credentialRows = await db
		.select()
		.from(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));

	const adminOverrides = await listAdminOverrides(db, schoolId);
	const disabledProviderIds = new Set(
		adminOverrides.filter((row) => row.modelId === null).map((row) => row.providerId)
	);
	const disabledModelKeys = new Set(
		adminOverrides
			.filter((row) => row.modelId !== null)
			.map((row) => `${row.providerId}::${row.modelId}`)
	);

	const result: AugmentedModelInfo[] = [];
	const seenIds = new Set<string>();

	for (const row of credentialRows) {
		if (row.enabled !== 1) continue;
		const providerId = row.providerId as ProviderId;
		const discovered = await getDiscoveredModelsForUser(db, env, userId, providerId);
		for (const model of discovered) {
			if (disabledProviderIds.has(model.providerId)) continue;
			if (disabledModelKeys.has(`${model.providerId}::${model.id}`)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			result.push({ ...model, source: 'user' });
		}
	}

	for (const [providerId, envKey] of Object.entries(PLATFORM_ENV_KEYS)) {
		if (!envKey) continue;
		if (!env[envKey]) continue;
		if (disabledProviderIds.has(providerId)) continue;
		const cached = await getCachedPlatformProviderModels(
			db,
			env,
			schoolId,
			providerId as ProviderId
		);
		for (const model of cached) {
			if (disabledProviderIds.has(model.providerId)) continue;
			if (disabledModelKeys.has(`${model.providerId}::${model.id}`)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			result.push({ ...model, source: 'platform' });
		}
	}

	result.sort((a, b) => a.id.localeCompare(b.id));
	return result;
}

function isBuiltinModel(value: ModelInfo): boolean {
	return Object.prototype.hasOwnProperty.call(BUILTIN_MODELS, value.id);
}

function isProviderDisabledByAdmin(
	overrides: Array<{ providerId: string; modelId: string | null }>,
	providerId: string
): boolean {
	return overrides.some(
		(row) => row.providerId === providerId && row.modelId === null
	);
}

export async function getAvailableModelsForUser(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	schoolId: number = 1
): Promise<AugmentedModelInfo[]> {
	const credentialRows = await db
		.select()
		.from(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));

	const hiddenIds = await getCachedHiddenModelIdsForUser(db, userId);
	const adminOverrides = await listAdminOverrides(db, schoolId);

	const result: AugmentedModelInfo[] = [];
	const seenIds = new Set<string>();
	const userProviderIds = new Set<string>();

	for (const row of credentialRows) {
		if (row.enabled !== 1) continue;
		const providerId = row.providerId as ProviderId;
		const discovered = await getDiscoveredModelsForUser(db, env, userId, providerId);

		for (const model of discovered) {
			if (hiddenIds.has(model.id)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			userProviderIds.add(model.providerId);
			result.push({ ...model, source: 'user' });
		}
	}

	for (const [providerId, envKey] of Object.entries(PLATFORM_ENV_KEYS)) {
		if (!envKey) continue;
		if (userProviderIds.has(providerId as ProviderId)) continue;
		if (!env[envKey]) continue;
		if (isProviderDisabledByAdmin(adminOverrides, providerId)) continue;

		const cached = await getCachedPlatformProviderModels(
			db,
			env,
			schoolId,
			providerId as ProviderId
		);
		for (const model of cached) {
			if (hiddenIds.has(model.id)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			result.push({ ...model, source: 'platform' });
		}
	}

	result.sort((a, b) => {
		const aBuiltin = isBuiltinModel(a) ? 0 : 1;
		const bBuiltin = isBuiltinModel(b) ? 0 : 1;
		if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
		return a.id.localeCompare(b.id);
	});

	const filtered = applyAdminDenylist(
		result.map((entry) => ({ providerId: entry.providerId, modelId: entry.id })),
		adminOverrides
	);
	const allowedIds = new Set(filtered.map((entry) => `${entry.providerId}::${entry.modelId}`));
	return result.filter((entry) => allowedIds.has(`${entry.providerId}::${entry.id}`));
}

