/**
 * Custom-provider model discovery — V2.
 *
 * Slimmed from V1: only the "fetch /models from a user-defined custom
 * OpenAI-compatible provider at connect time" path. V2 does not parse
 * the response into ModelInfo — it just persists the raw
 * `{id, displayName}[]` that the custom-provider schema stores, and
 * `availability.ts` reads that list back for the model selector.
 */
import { eq, and, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import {
	encryptedCredentials,
	platformProviderDiscoveries,
	type EncryptedCredential
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ProviderId, ModelId } from '$lib/provider/types';
import { ModelInfoSchema, type ModelInfo } from '$lib/provider/spec';
import { encrypt as encryptText, decrypt as decryptText, getEncryptionKey } from './crypto';
import { DecryptionError } from '$lib/provider/errors';
import { decryptCustomProvider } from './credentials';

export const DISCOVERY_TIMEOUT_MS = 10_000;
export const DISCOVERY_ATTEMPTS = 3;
export const DISCOVERY_BACKOFF_BASE_MS = 250;
export const DISCOVERY_BACKOFF_MAX_MS = 2_000;

export interface BackoffOptions {
	attempts: number;
	baseMs: number;
	maxMs: number;
	shouldRetry?: (err: unknown) => boolean;
}

/** Minimal credential shape required by `discoverProviderModels`. */
export interface UserCredentialAdapter {
	providerId: string;
	credentialKind: 'personal' | 'donation' | 'custom';
	encryptedData: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function exponentialDelay(attempt: number, baseMs: number, maxMs: number): number {
	const delay = baseMs * 2 ** attempt;
	return Math.min(delay, maxMs);
}

export async function withExponentialBackoff<T>(
	fn: () => Promise<T>,
	options: BackoffOptions
): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 0; attempt < options.attempts; attempt += 1) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			const isLast = attempt === options.attempts - 1;
			if (isLast) break;
			if (options.shouldRetry && !options.shouldRetry(err)) break;
			const delayMs = exponentialDelay(attempt, options.baseMs, options.maxMs);
			await sleep(delayMs);
		}
	}
	throw lastErr;
}
const SKIP_DISCOVERY_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
	'opengateway' as ProviderId,
	'nvidia' as ProviderId,
	'mistral' as ProviderId
]);

const RawArchitectureSchema = z
	.object({
		input_modalities: z.array(z.string()).optional(),
		output_modalities: z.array(z.string()).optional()
	})
	.optional();

const RawCapabilitiesSchema = z
	.object({
		function_calling: z.boolean().optional()
	})
	.optional();

const RawTopProviderSchema = z
	.object({
		max_completion_tokens: z.number().optional()
	})
	.optional();

const RawPricingSchema = z
	.object({
		prompt: z.string().optional(),
		completion: z.string().optional()
	})
	.optional();

const RawModelSchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	description: z.string().optional(),
	context_length: z.number().optional(),
	supported_parameters: z.array(z.string()).optional(),
	capabilities: RawCapabilitiesSchema,
	architecture: RawArchitectureSchema,
	top_provider: RawTopProviderSchema,
	pricing: RawPricingSchema
});

type RawModel = z.infer<typeof RawModelSchema>;

function mapModality(modality: string): string {
	const lower = modality.toLowerCase();
	switch (lower) {
		case 'text':
			return 'text/*';
		case 'image':
			return 'image/*';
		case 'file':
			return 'application/*';
		case 'audio':
			return 'audio/*';
		case 'video':
			return 'video/*';
		default:
			return modality;
	}
}

function mapModalities(modalities: ReadonlyArray<string> | undefined): string[] {
	if (!modalities || modalities.length === 0) return [];
	return modalities.map(mapModality);
}

function safeParsePricing(raw: RawModel['pricing']): ModelInfo['cost'] | undefined {
	if (!raw) return undefined;
	if (raw.prompt === '0') {
		return { input: 0, output: 0, cache: { read: 0, write: 0 } };
	}
	const input = Number.parseFloat(raw.prompt ?? '0');
	const output = Number.parseFloat(raw.completion ?? '0');
	return {
		input: Number.isFinite(input) ? input : 0,
		output: Number.isFinite(output) ? output : 0,
		cache: { read: 0, write: 0 }
	};
}

function buildModelInfo(raw: RawModel, providerId: ProviderId): ModelInfo | null {
	if (!raw.id) return null;
	const inputModalities = raw.architecture?.input_modalities ?? [];
	const outputModalities = raw.architecture?.output_modalities ?? [];
	const supportedParams = raw.supported_parameters ?? [];
	const tools = supportedParams.includes('tools') || raw.capabilities?.function_calling === true;
	const reasoning =
		supportedParams.includes('reasoning') || supportedParams.includes('reasoning_effort');
	const vision = inputModalities.includes('image') || inputModalities.includes('file');

	const candidate = {
		id: `${providerId}/${raw.id}`,
		providerId,
		name: raw.name ?? raw.id,
		capabilities: {
			tools,
			input: mapModalities(inputModalities),
			output: mapModalities(outputModalities),
			reasoning,
			vision
		},
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active' as const,
		enabled: true,
		limit: {
			context: raw.context_length ?? 8192,
			output: raw.top_provider?.max_completion_tokens ?? 4096
		},
		tier: 'mid' as const,
		cost: safeParsePricing(raw.pricing),
		description: raw.description ?? ''
	};

	const parsed = ModelInfoSchema.safeParse(candidate);
	return parsed.success ? parsed.data : null;
}

function extractModelsFromResponse(json: unknown): RawModel[] {
	if (!json || typeof json !== 'object') return [];
	const candidate = json as { data?: unknown };
	if (!Array.isArray(candidate.data)) return [];
	const out: RawModel[] = [];
	for (const item of candidate.data) {
		const result = RawModelSchema.safeParse(item);
		if (result.success) out.push(result.data);
	}
	return out;
}

async function fetchModelsOnce(
	baseUrl: string,
	apiKey: string | undefined,
	fetchImpl?: typeof fetch
): Promise<RawModel[]> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

	const doFetch = fetchImpl ?? fetch;
	const response = await doFetch(`${baseUrl}/models`, {
		method: 'GET',
		headers,
		signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status}`);
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch (err) {
		throw new Error('Failed to parse /models response as JSON');
	}

	return extractModelsFromResponse(json);
}

async function fetchModels(
	baseUrl: string,
	apiKey: string | undefined,
	fetchImpl?: typeof fetch
): Promise<RawModel[]> {
	return withExponentialBackoff(
		() => fetchModelsOnce(baseUrl, apiKey, fetchImpl),
		{
			attempts: DISCOVERY_ATTEMPTS,
			baseMs: DISCOVERY_BACKOFF_BASE_MS,
			maxMs: DISCOVERY_BACKOFF_MAX_MS
		}
	).catch((err) => {
		console.warn(
			`[discoverProviderModels] /models failed after ${DISCOVERY_ATTEMPTS} attempts from ${baseUrl}:`,
			err
		);
		return [];
	});
}

export async function discoverProviderModels(
	credential: EncryptedCredential | UserCredentialAdapter,
	env: Record<string, string | undefined>,
	fetchImpl?: typeof fetch
): Promise<ModelInfo[]> {
	const providerId = credential.providerId as ProviderId;
	if (SKIP_DISCOVERY_PROVIDERS.has(providerId)) return [];
	const credentialKind = 'credentialKind' in credential ? credential.credentialKind : null;
	if (credentialKind === null) return [];
	if (!credential.encryptedData) return [];

	let baseUrl: string;
	let apiKey: string | undefined;

	if (credentialKind === 'personal') {
		// Built-in provider with a user-supplied key: use the catalog URL.
		const { BUILTIN_PROVIDERS } = await import('$lib/provider/catalog');
		const info = BUILTIN_PROVIDERS[providerId];
		if (!info?.api?.url) return [];
		baseUrl = info.api.url.replace(/\/+$/, '');
		const { resolveApiKeyForCredential } = await import('./credentials');
		apiKey =
			resolveApiKeyForCredential(credential as EncryptedCredential, env, providerId) ?? undefined;
		if (!apiKey) return [];
	} else {
		// Custom provider: read baseUrl + apiKey from the encrypted blob.
		const decrypted = decryptCustomProvider(credential.encryptedData, env);
		if (!decrypted || !decrypted.baseUrl) return [];
		baseUrl = decrypted.baseUrl.replace(/\/+$/, '');
		apiKey = decrypted.apiKey;
	}

	let rawModels: RawModel[];
	try {
		rawModels = await fetchModels(baseUrl, apiKey, fetchImpl);
	} catch (err) {
		console.warn(
			`[discoverProviderModels:${providerId}] Fetch failed for ${baseUrl}/models:`,
			err
		);
		return [];
	}

	const models: ModelInfo[] = [];
	for (const raw of rawModels) {
		const built = buildModelInfo(raw, providerId);
		if (!built) continue;
		if (built.id.startsWith('~')) continue;
		models.push(built);
	}
	return models;
}

export async function persistDiscoveredModels(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId,
	models: ModelInfo[]
): Promise<void> {
	const encryptionKey = getEncryptionKey(env);
	const encrypted = encryptText(JSON.stringify(models), encryptionKey);
	await db
		.update(encryptedCredentials)
		.set({
			discoveredModels: encrypted,
			discoveredAt: sql`(datetime('now'))`
		})
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId),
				eq(encryptedCredentials.providerId, providerId)
			)
		);
}

const ModelInfoListSchema = z.array(ModelInfoSchema);

export async function getDiscoveredModelsForUser(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId
): Promise<ModelInfo[]> {
	const rows = await db
		.select({ discoveredModels: encryptedCredentials.discoveredModels })
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId),
				eq(encryptedCredentials.providerId, providerId)
			)
		)
		.limit(1);

	const encrypted = rows[0]?.discoveredModels;
	if (!encrypted) return [];

	const encryptionKey = getEncryptionKey(env);
	let decrypted: string;
	try {
		decrypted = decryptText(encrypted, encryptionKey);
	} catch (err) {
		if (!(err instanceof DecryptionError)) {
			console.warn(
				`[getDiscoveredModelsForUser:${providerId}] unexpected decrypt failure:`,
				err
			);
		}
		return [];
	}
	if (!decrypted) return [];

	try {
		const parsed = ModelInfoListSchema.safeParse(JSON.parse(decrypted));
		return parsed.success ? parsed.data : [];
	} catch (err) {
		console.warn(
			`[getDiscoveredModelsForUser:${providerId}] Failed to parse discovered models:`,
			err
		);
		return [];
	}
}

export type { ModelId };

/**
 * Discover and cache the model list for an env-backed (platform) provider.
 *
 * Resolves the API key from `PLATFORM_ENV_KEYS`, fetches `${catalogUrl}/models`,
 * persists the encrypted result into `platform_provider_discoveries` keyed by
 * `(schoolId, providerId)`, and returns the parsed `ModelInfo[]`. Called by
 * the availability pipeline for any school whose platform provider is
 * enabled.
 */
export async function discoverPlatformProviderModels(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	schoolId: number,
	providerId: ProviderId
): Promise<ModelInfo[]> {
	if (SKIP_DISCOVERY_PROVIDERS.has(providerId)) return [];
	const { PLATFORM_ENV_KEYS } = await import('./credentials');
	const envKey = PLATFORM_ENV_KEYS[providerId];
	if (!envKey) return [];
	const apiKey = env[envKey];
	if (!apiKey) return [];

	const { BUILTIN_PROVIDERS } = await import('$lib/provider/catalog');
	const info = BUILTIN_PROVIDERS[providerId];
	if (!info?.api?.url) return [];
	const baseUrl = info.api.url.replace(/\/+$/, '');

	const rawModels = await fetchModels(baseUrl, apiKey);

	const models: ModelInfo[] = [];
	for (const raw of rawModels) {
		const built = buildModelInfo(raw, providerId);
		if (!built) continue;
		if (built.id.startsWith('~')) continue;
		models.push(built);
	}

	const encryptionKey = getEncryptionKey(env);
	const encrypted = encryptText(JSON.stringify(models), encryptionKey);
	const now = sql`(datetime('now'))`;
	await db
		.insert(platformProviderDiscoveries)
		.values({ schoolId, providerId, models: encrypted, discoveredAt: now })
		.onConflictDoUpdate({
			target: [platformProviderDiscoveries.schoolId, platformProviderDiscoveries.providerId],
			set: { models: encrypted, discoveredAt: now }
		});

	return models;
}

/**
 * Read the cached discovery for a platform provider. Returns `[]` if no
 * cache row exists yet or decryption/parse fails. Callers should
 * opportunistically trigger `discoverPlatformProviderModels` when this
 * returns empty.
 */
export async function getCachedPlatformProviderModels(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	schoolId: number,
	providerId: ProviderId
): Promise<ModelInfo[]> {
	const rows = await db
		.select({ models: platformProviderDiscoveries.models })
		.from(platformProviderDiscoveries)
		.where(
			and(
				eq(platformProviderDiscoveries.schoolId, schoolId),
				eq(platformProviderDiscoveries.providerId, providerId)
			)
		)
		.limit(1);
	const encrypted = rows[0]?.models;
	if (!encrypted) return [];
	const encryptionKey = getEncryptionKey(env);
	try {
		const decrypted = decryptText(encrypted, encryptionKey);
		const parsed = ModelInfoListSchema.safeParse(JSON.parse(decrypted));
		return parsed.success ? parsed.data : [];
	} catch (err) {
		if (!(err instanceof DecryptionError)) {
			console.warn(
				`[getCachedPlatformProviderModels:${providerId}] decrypt/parse failed:`,
				err
			);
		}
		return [];
	}
}

/**
 * Aggregate all `discovered_models` snapshots across a user's credentials
 * into a single lookup map. Used by `catalog.ts:resolveModelInfo` to find
 * custom-provider models SSR-side without an extra roundtrip per provider.
 *
 * Iterates the user's credential rows and decrypts each one's
 * `discovered_models` JSON. Uses `$env/dynamic/private` so encryption and
 * decryption resolve to the same env source (Chunks 4 hardening later
 * moves this to a passed-in `env` parameter).
 */
export async function getAllDiscoveredModelsForUser(
	db: LibSQLDatabase<any>,
	userId: number
): Promise<Map<ModelId, ModelInfo>> {
	const { env: svelteEnv } = await import('$env/dynamic/private');
	const encryptionKey = getEncryptionKey(svelteEnv as Record<string, string | undefined>);

	const rows = await db
		.select({
			discoveredModels: encryptedCredentials.discoveredModels,
			providerId: encryptedCredentials.providerId
		})
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId),
				sql`${encryptedCredentials.discoveredModels} IS NOT NULL`
			)
		);

	const out = new Map<ModelId, ModelInfo>();
	for (const row of rows) {
		if (!row.discoveredModels) continue;
		try {
			const decrypted = decryptText(row.discoveredModels, encryptionKey);
			const parsed = ModelInfoListSchema.safeParse(JSON.parse(decrypted));
			if (!parsed.success) continue;
			for (const model of parsed.data) {
				out.set(model.id, model);
			}
		} catch (err) {
			console.warn(
				`[getAllDiscoveredModelsForUser:${row.providerId}] Failed to parse discovered models:`,
				err
			);
		}
	}
	return out;
}
