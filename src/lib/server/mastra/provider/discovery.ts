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
import { userCredentials, type UserCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ProviderId, ModelId } from '$lib/provider/types';
import { ModelInfoSchema, type ModelInfo } from '$lib/provider/spec';
import { encrypt as encryptText, decrypt as decryptText } from './crypto';
import { decryptCustomProvider } from './credentials';

const ENCRYPTION_KEY_FALLBACK = 'edapex-default-encryption-key-32ch';

function getEncryptionKey(env: Record<string, string | undefined> | undefined): string {
	const source = env ?? ((process.env as Record<string, string | undefined>) ?? {});
	return source.TOKEN_ENCRYPTION_KEY || source.ENCRYPTION_KEY || ENCRYPTION_KEY_FALLBACK;
}

const DISCOVERY_TIMEOUT_MS = 10_000;
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
	.passthrough()
	.optional();

const RawCapabilitiesSchema = z
	.object({
		function_calling: z.boolean().optional()
	})
	.passthrough()
	.optional();

const RawTopProviderSchema = z
	.object({
		max_completion_tokens: z.number().optional()
	})
	.passthrough()
	.optional();

const RawPricingSchema = z
	.object({
		prompt: z.string().optional(),
		completion: z.string().optional()
	})
	.passthrough()
	.optional();

const RawModelSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().optional(),
		description: z.string().optional(),
		context_length: z.number().optional(),
		supported_parameters: z.array(z.string()).optional(),
		capabilities: RawCapabilitiesSchema,
		architecture: RawArchitectureSchema,
		top_provider: RawTopProviderSchema,
		pricing: RawPricingSchema
	})
	.passthrough();

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
		id: `${providerId}:${raw.id}`,
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

async function fetchModels(
	baseUrl: string,
	apiKey: string | undefined
): Promise<RawModel[]> {
	const headers: Record<string, string> = { Accept: 'application/json' };
	if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

	const response = await fetch(`${baseUrl}/models`, {
		method: 'GET',
		headers,
		signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS)
	});

	if (!response.ok) {
		console.warn(
			`[discoverProviderModels] /models returned HTTP ${response.status} from ${baseUrl}`
		);
		return [];
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch (err) {
		console.warn('[discoverProviderModels] Failed to parse /models response as JSON:', err);
		return [];
	}

	return extractModelsFromResponse(json);
}

export async function discoverProviderModels(
	credential: UserCredential,
	env: Record<string, string | undefined>
): Promise<ModelInfo[]> {
	const providerId = credential.providerId as ProviderId;
	if (SKIP_DISCOVERY_PROVIDERS.has(providerId)) return [];
	if (credential.credentialType === 'env') return [];
	if (credential.credentialType === 'credential') return [];
	if (!credential.encryptedData) return [];

	const decrypted = decryptCustomProvider(credential.encryptedData, env);
	if (!decrypted || !decrypted.baseUrl) return [];

	const baseUrl = decrypted.baseUrl.replace(/\/+$/, '');
	const apiKey = decrypted.apiKey;

	let rawModels: RawModel[];
	try {
		rawModels = await fetchModels(baseUrl, apiKey);
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
	userId: number,
	providerId: ProviderId,
	models: ModelInfo[]
): Promise<void> {
	const encryptionKey = getEncryptionKey(process.env as Record<string, string | undefined>);
	const encrypted = encryptText(JSON.stringify(models), encryptionKey);
	await db
		.update(userCredentials)
		.set({
			discoveredModels: encrypted,
			discoveredAt: sql`(datetime('now'))`
		})
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)));
}

const ModelInfoListSchema = z.array(ModelInfoSchema);

export async function getDiscoveredModelsForUser(
	db: LibSQLDatabase<any>,
	userId: number,
	providerId: ProviderId
): Promise<ModelInfo[]> {
	const rows = await db
		.select({ discoveredModels: userCredentials.discoveredModels })
		.from(userCredentials)
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)))
		.limit(1);

	const encrypted = rows[0]?.discoveredModels;
	if (!encrypted) return [];

	const encryptionKey = getEncryptionKey(process.env as Record<string, string | undefined>);
	const decrypted = decryptText(encrypted, encryptionKey);
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
