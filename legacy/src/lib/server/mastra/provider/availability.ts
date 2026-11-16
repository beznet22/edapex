/**
 * Per-user model availability — V4.
 *
 * Returns models for the chat model-selector and the Settings → Models
 * tab. Source model inventory:
 * - User-connected credentials: discoveries stored on the credential row
 *   in `encrypted_credentials.discovered_models`.
 * - Platform (env-backed) providers: discoveries cached in
 *   `platform_provider_discoveries`.
 * - Static `BUILTIN_MODELS` catalog: source of truth for catalog-known
 *   models. When a user has a credential for a catalog provider, every
 *   catalog entry for that provider is auto-included (subject to the
 *   admin denylist and user-hidden filters).
 *
 * Visibility semantics:
 * - Catalog-known models are auto-enabled by default. The user can
 *   hide them via Settings → Models, which adds the id to the hidden
 *   set (denylist). A hidden catalog model stays hidden even after a
 *   new credential is added.
 * - Discovered models that do NOT match a catalog id are opt-in.
 *   They are surfaced in the Models tab (with a "Discovered" badge)
 *   but excluded from the chat model-selector until the user toggles
 *   them on. Toggling on adds the id to the enabled set (allowlist).
 *
 * A provider that is admin-disabled platform-wide
 * (`admin_model_overrides` with `modelId = null`) is skipped entirely
 * unless the user has connected their own key, which overrides the
 * platform decision.
 */
import { and, eq } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { encryptedCredentials } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { AugmentedModelInfo, ModelInfo } from '$lib/provider/spec';
import type { ProviderId } from '$lib/provider/types';
import { BUILTIN_MODELS, getCatalogModelsByProvider, isCatalogModelId } from '$lib/provider/catalog';
import {
	getCachedPlatformProviderModels,
	getAllDiscoveredModelsForUser
} from './discovery';
import {
	getCachedEnabledModelIdsForUser,
	getCachedHiddenModelIdsForUser,
	getCachedPotluckConfig
} from './cache';
import { applyAdminDenylist, listAdminOverrides } from './admin-model-overrides';
import { PLATFORM_ENV_KEYS } from './credentials';
import { findActiveDonationForProvider, parseJsonArray } from './potluck';

export type { AugmentedModelInfo } from '$lib/provider/spec';

/**
 * Returns EVERY model the user can see in the Settings → Models tab,
 * regardless of enabled/disabled state. Used to populate the toggle
 * list so the user can opt into non-catalog "discovered" models.
 *
 * Emits:
 * - Every discovered model for every user credential (whether the
 *   id matches the catalog or not).
 * - Every catalog model for every credentialed provider (so the user
 *   can see what's auto-included and toggle-off if desired).
 * - Platform discoveries (env-backed providers with cached lists).
 *
 * Each entry is tagged with `isCatalogKnown` so the UI can group
 * "Built-in" vs "Discovered" sections.
 */
export async function getAllDiscoveredModelsForSettings(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	schoolId: number = 1,
	userRole: string | null = null
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
	const userProviderIds = new Set<string>();

	const allDiscovered = await getAllDiscoveredModelsForUser(db, userId);

	// Pass 1: per-credential discovered models + catalog extras.
	// Note: user-scoped credentials are NOT subject to the provider-level
	// admin denylist — if the user has their own key, they get to use the
	// provider regardless of platform-level admin preferences. Per-model
	// admin denials still apply (see `disabledModelKeys`).
	for (const row of credentialRows) {
		if (row.enabled !== 1) continue;
		const providerId = row.providerId as ProviderId;
		userProviderIds.add(providerId);

		// 1a. Every discovered model for this credential, as-is.
		for (const model of allDiscovered.values()) {
			if (model.providerId !== providerId) continue;
			if (disabledModelKeys.has(`${model.providerId}::${model.id}`)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			const catalog = isCatalogModelId(model.id) ? BUILTIN_MODELS[model.id] : undefined;
			result.push({ ...(catalog ?? model), source: 'user', isCatalogKnown: !!catalog });
		}

		// 1b. Catalog models for this provider that the upstream didn't return.
		for (const catalogModel of getCatalogModelsByProvider(providerId)) {
			if (disabledModelKeys.has(`${catalogModel.providerId}::${catalogModel.id}`)) continue;
			if (seenIds.has(catalogModel.id)) continue;
			seenIds.add(catalogModel.id);
			result.push({ ...catalogModel, source: 'user', isCatalogKnown: true });
		}
	}

	// Pass 2: pool-sourced (school donations). Only consultable when
	// the user has no personal credential for a given provider. Follows
	// the same gates as tier-router: pool config enabled, consumerRoles
	// allowlist, allowedProviders filter, admin denylist, active donation.
	// Emitted models are tagged source='pool' so the UI can badge them.
	const poolCfg = await getCachedPotluckConfig(db, schoolId);
	if (poolCfg && poolCfg.enabled === 1) {
		const consumerRoles = parseJsonArray(poolCfg.consumerRoles);
		if (
			consumerRoles.length === 0 ||
			(userRole !== null && consumerRoles.includes(userRole))
		) {
			const allowedPoolProviders = parseJsonArray(poolCfg.allowedProviders);
			const catalogProviders = new Set(
				Object.values(BUILTIN_MODELS).map((m) => m.providerId)
			);
			for (const providerId of catalogProviders) {
			if (disabledProviderIds.has(providerId)) continue;
			if (userProviderIds.has(providerId)) continue;
				if (
					allowedPoolProviders.length > 0 &&
					!allowedPoolProviders.includes(providerId)
				) {
					continue;
				}
				const donation = await findActiveDonationForProvider(
					db,
					env,
					schoolId,
					providerId as ProviderId
				);
				if (!donation) continue;
				for (const catalogModel of getCatalogModelsByProvider(providerId as ProviderId)) {
					if (disabledModelKeys.has(`${catalogModel.providerId}::${catalogModel.id}`)) continue;
					if (seenIds.has(catalogModel.id)) continue;
					seenIds.add(catalogModel.id);
					result.push({ ...catalogModel, source: 'pool', isCatalogKnown: true });
				}
			}
		}
	}

	// Pass 3: platform (env-backed) providers
	for (const [providerId, envKey] of Object.entries(PLATFORM_ENV_KEYS)) {
		if (!envKey) continue;
		if (!env[envKey]) continue;
		if (disabledProviderIds.has(providerId)) continue;
		// Mistral is OCR-only; never surface its models in chat-side
		// availability (model selector, Models tab, getAvailableModels).
		if ((providerId as ProviderId) === ('mistral' as ProviderId)) continue;

		const cached = await getCachedPlatformProviderModels(
			db,
			env,
			schoolId,
			providerId as ProviderId
		);
		for (const model of cached) {
			if (disabledModelKeys.has(`${model.providerId}::${model.id}`)) continue;
			if (seenIds.has(model.id)) continue;
			seenIds.add(model.id);
			const catalog = isCatalogModelId(model.id) ? BUILTIN_MODELS[model.id] : undefined;
			result.push({ ...(catalog ?? model), source: 'platform', isCatalogKnown: !!catalog });
		}
		for (const catalogModel of getCatalogModelsByProvider(providerId as ProviderId)) {
			if (disabledModelKeys.has(`${catalogModel.providerId}::${catalogModel.id}`)) continue;
			if (seenIds.has(catalogModel.id)) continue;
			seenIds.add(catalogModel.id);
			result.push({ ...catalogModel, source: 'platform', isCatalogKnown: true });
		}
	}

	result.sort((a, b) => a.id.localeCompare(b.id));
	return result;
}

function isBuiltinModel(value: ModelInfo): boolean {
	return isCatalogModelId(value.id);
}

function isProviderDisabledByAdmin(
	overrides: Array<{ providerId: string; modelId: string | null }>,
	providerId: string
): boolean {
	return overrides.some(
		(row) => row.providerId === providerId && row.modelId === null
	);
}

/**
 * Returns the SET of models the user can pick in the chat
 * model-selector. Applies:
 * - Catalog-known auto-include: any catalog model for a credentialed
 *   provider is shown unless explicitly hidden.
 * - Discovered-non-catalog opt-in: only shown if the user toggled
 *   the id on in Settings → Models (allowlist).
 * - Denylist (hiddenIds) and admin denylist.
 */
export async function getAvailableModelsForUser(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	schoolId: number = 1,
	userRole: string | null = null
): Promise<AugmentedModelInfo[]> {
	const credentialRows = await db
		.select()
		.from(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));

	const hiddenIds = await getCachedHiddenModelIdsForUser(db, userId);
	const enabledIds = await getCachedEnabledModelIdsForUser(db, userId);
	const adminOverrides = await listAdminOverrides(db, schoolId);
	// Per-model denylist (admin disabled a specific model id; the
	// provider-level denylist is handled separately at Pass 3).
	const disabledModelKeys = new Set(
		adminOverrides
			.filter((row) => row.modelId !== null)
			.map((row) => `${row.providerId}::${row.modelId}`)
	);

	const result: AugmentedModelInfo[] = [];
	const seenIds = new Set<string>();
	const userProviderIds = new Set<string>();

	const allDiscovered = await getAllDiscoveredModelsForUser(db, userId);

	// Pass 1: per-credential
	for (const row of credentialRows) {
		if (row.enabled !== 1) continue;
		const providerId = row.providerId as ProviderId;
		// Provider-level admin denylist does NOT block user-scoped models:
		// the comment at the top of this file promises that "the user has
		// connected their own key, which overrides the platform decision."
		// Per-model denylist still applies (see `disabledModelKeys` checks
		// inside the loops below).
		userProviderIds.add(providerId);

		// 1a. Catalog models for this provider — auto-included unless hidden
		// or per-model-disabled by admin.
		for (const catalogModel of getCatalogModelsByProvider(providerId)) {
			if (hiddenIds.has(catalogModel.id)) continue;
			if (disabledModelKeys.has(`${catalogModel.providerId}::${catalogModel.id}`)) continue;
			if (seenIds.has(catalogModel.id)) continue;
			seenIds.add(catalogModel.id);
			result.push({ ...catalogModel, source: 'user', isCatalogKnown: true });
		}

		// 1b. Discovered models — catalog-known merge with catalog, others
		//     require explicit enable.
		for (const d of allDiscovered.values()) {
			if (d.providerId !== providerId) continue;
			if (isCatalogModelId(d.id)) {
				// Catalog-known: already emitted in 1a (if not hidden).
				continue;
			}
			if (!enabledIds.has(d.id)) continue; // require opt-in
			if (hiddenIds.has(d.id)) continue;
			if (seenIds.has(d.id)) continue;
			seenIds.add(d.id);
			result.push({ ...d, source: 'user', isCatalogKnown: false });
		}
	}

	// Pass 2: pool-sourced (school donations). Only consultable when
	// the user has no personal credential for a given provider. Follows
	// the same gates as tier-router: pool config enabled, consumerRoles
	// allowlist, allowedProviders filter, admin denylist, active donation.
	const poolCfg2 = await getCachedPotluckConfig(db, schoolId);
	if (poolCfg2 && poolCfg2.enabled === 1) {
		const consumerRoles2 = parseJsonArray(poolCfg2.consumerRoles);
		if (
			consumerRoles2.length === 0 ||
			(userRole !== null && consumerRoles2.includes(userRole))
		) {
			const allowedPoolProviders2 = parseJsonArray(poolCfg2.allowedProviders);
			const catalogProviders2 = new Set(
				Object.values(BUILTIN_MODELS).map((m) => m.providerId)
			);
			for (const providerId of catalogProviders2) {
				if (isProviderDisabledByAdmin(adminOverrides, providerId)) continue;
				if (userProviderIds.has(providerId)) continue;
				if (
					allowedPoolProviders2.length > 0 &&
					!allowedPoolProviders2.includes(providerId)
				) {
					continue;
				}
				const donation = await findActiveDonationForProvider(
					db,
					env,
					schoolId,
					providerId as ProviderId
				);
				if (!donation) continue;
				for (const catalogModel of getCatalogModelsByProvider(providerId as ProviderId)) {
					if (hiddenIds.has(catalogModel.id)) continue;
					if (seenIds.has(catalogModel.id)) continue;
					seenIds.add(catalogModel.id);
					result.push({ ...catalogModel, source: 'pool', isCatalogKnown: true });
				}
			}
		}
	}

	// Pass 3: platform (env-backed) providers not already covered by user credentials
	for (const [providerId, envKey] of Object.entries(PLATFORM_ENV_KEYS)) {
		if (!envKey) continue;
		if (userProviderIds.has(providerId as ProviderId)) continue;
		if (!env[envKey]) continue;
		if (isProviderDisabledByAdmin(adminOverrides, providerId)) continue;
		// Mistral is OCR-only; never surface its models in chat-side
		// availability (model selector, Models tab, getAvailableModels).
		if ((providerId as ProviderId) === ('mistral' as ProviderId)) continue;

		// 2a. Catalog models for this platform provider.
		for (const catalogModel of getCatalogModelsByProvider(providerId as ProviderId)) {
			if (hiddenIds.has(catalogModel.id)) continue;
			if (seenIds.has(catalogModel.id)) continue;
			seenIds.add(catalogModel.id);
			result.push({ ...catalogModel, source: 'platform', isCatalogKnown: true });
		}

		// 2b. Discovered non-catalog for this platform provider (opt-in).
		const cached = await getCachedPlatformProviderModels(
			db,
			env,
			schoolId,
			providerId as ProviderId
		);
		for (const d of cached) {
			if (isCatalogModelId(d.id)) continue; // covered by 2a
			if (!enabledIds.has(d.id)) continue;
			if (hiddenIds.has(d.id)) continue;
			if (seenIds.has(d.id)) continue;
			seenIds.add(d.id);
			result.push({ ...d, source: 'platform', isCatalogKnown: false });
		}
	}

	// Static catalog fallback: when nothing else produced models, surface
	// catalog entries for the user's enabled credentials only (so the
	// selector stays usable). This is a degraded fallback for when
	// discovery has never completed.
	if (result.length === 0) {
		for (const row of credentialRows) {
			if (row.enabled !== 1) continue;
			const providerId = row.providerId as ProviderId;
			// Mistral is OCR-only.
			if (providerId === ('mistral' as ProviderId)) continue;
			if (isProviderDisabledByAdmin(adminOverrides, providerId)) continue;
			for (const catalogModel of getCatalogModelsByProvider(providerId)) {
				if (hiddenIds.has(catalogModel.id)) continue;
				if (seenIds.has(catalogModel.id)) continue;
				seenIds.add(catalogModel.id);
				result.push({ ...catalogModel, source: 'user', isCatalogKnown: true });
			}
		}
	}

	result.sort((a, b) => {
		const aBuiltin = isBuiltinModel(a) ? 0 : 1;
		const bBuiltin = isBuiltinModel(b) ? 0 : 1;
		if (aBuiltin !== bBuiltin) return aBuiltin - bBuiltin;
		return a.id.localeCompare(b.id);
	});

	// Apply the admin denylist ONLY to platform-sourced entries. User
	// credentials and pool donations are user-driven — when a user
	// has connected their own key, or when the school has a pool
	// donation, those models are visible regardless of the platform
	// admin's provider-level preference. Per-model denials (modelId
	// !== null) still apply to every source.
	const platformEntries = result
		.filter((entry) => entry.source === 'platform')
		.map((entry) => ({ providerId: entry.providerId, modelId: entry.id }));
	const filteredPlatform = applyAdminDenylist(platformEntries, adminOverrides);
	const allowedPlatformIds = new Set(
		filteredPlatform.map((entry) => `${entry.providerId}::${entry.modelId}`)
	);
	return result.filter((entry) => {
		// User + pool sources bypass the provider-level denylist, but still
		// honour per-model denials.
		if (entry.source === 'user' || entry.source === 'pool') {
			return !disabledModelKeys.has(`${entry.providerId}::${entry.id}`);
		}
		// Platform source: full denylist applies.
		return allowedPlatformIds.has(`${entry.providerId}::${entry.id}`);
	});
}
