/**
 * Per-user model availability — V2.
 *
 * Slimmed from V1:
 * - Drops the platform-default synthesis loop (the V2 resolver does the
 *   user-credential → env-fallback resolution inline, so a separate
 *   "platform default" virtual credential row is no longer needed).
 * - Keeps the BUILTIN + user-discovered merge with visibility filtering.
 *
 * Used by the model selector and the SSR auto-pick.
 */
import { eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { userCredentials } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { AugmentedModelInfo } from '$lib/provider/spec';
import type { ModelInfo } from '$lib/provider/spec';
import type { ProviderId } from '$lib/provider/types';
import { BUILTIN_MODELS, getModelsByProvider } from '$lib/provider/catalog';
import { getDiscoveredModelsForUser } from './discovery';
import { getCachedHiddenModelIdsForUser } from './cache';
import { applyAdminDenylist, listAdminOverrides } from './admin-model-overrides';

export type { AugmentedModelInfo } from '$lib/provider/spec';

function isBuiltinModel(value: ModelInfo): boolean {
	return Object.prototype.hasOwnProperty.call(BUILTIN_MODELS, value.id);
}

export async function getAvailableModelsForUser(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	schoolId: number = 1
): Promise<AugmentedModelInfo[]> {
	const credentialRows = await db
		.select()
		.from(userCredentials)
		.where(eq(userCredentials.userId, userId));

	const hiddenIds = await getCachedHiddenModelIdsForUser(db, userId);
	const adminOverrides = await listAdminOverrides(db, schoolId);

	const result: AugmentedModelInfo[] = [];
	const seenIds = new Set<string>();
	const userProviderIds = new Set<string>();

	for (const row of credentialRows) {
		if (row.enabled !== 1) continue;
		const providerId = row.providerId as ProviderId;

		const discovered = await getDiscoveredModelsForUser(db, env, userId, providerId);
		const credentialModels = discovered.length > 0 ? discovered : getModelsByProvider(providerId);

		for (const model of credentialModels) {
			if (hiddenIds.has(model.id)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			userProviderIds.add(model.providerId);
			result.push({ ...model, source: 'user' });
		}
	}

	for (const providerId of SUPPORTED_PROVIDER_IDS) {
		if (userProviderIds.has(providerId)) continue;
		const envKey = `${providerId.toUpperCase()}_API_KEY`;
		if (!env[envKey]) continue;
		for (const model of Object.values(BUILTIN_MODELS)) {
			if (model.providerId !== providerId) continue;
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

const SUPPORTED_PROVIDER_IDS: ProviderId[] = ['groq', 'deepseek', 'opencode', 'kimchi'];
