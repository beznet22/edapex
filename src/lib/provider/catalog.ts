/**
 * Built-in provider and model catalog (client-safe).
 *
 * Pure data — safe to import in client and server contexts.
 * Source of truth for which providers and models the platform natively supports.
 * Custom providers (user-defined) are NOT in this catalog; they are loaded at
 * runtime from `user_credentials` and merged into a per-request registry.
 *
 * Note: Mistral is NOT in this catalog. The Mistral SDK is used directly by
 * the extraction workflow for OCR — it is not part of the gateway routing.
 */
import type { ProviderInfo, ModelInfo, Variant } from './spec';
import type { ProviderId, ModelId } from './types';

/**
 * Shared thinking-mode variants for any DeepSeek V4 model, regardless of
 * which provider surfaces it (deepseek direct, opencode:zen proxy, etc.).
 *
 * Matches the DeepSeek Thinking API: `thinking.enabled` toggle +
 * `reasoning_effort` ∈ { 'high', 'medium', 'low' }.
 *
 * Reference: https://api-docs.deepseek.com/guides/thinking_mode
 */
const DEEPSEEK_THINKING_VARIANTS: Variant[] = [
	{
		id: 'high',
		label: 'High',
		description: 'Maximum reasoning depth',
		headers: {},
		body: {},
		generation: {},
		options: { thinking: { type: 'enabled' }, reasoningEffort: 'high' }
	},
	{
		id: 'medium',
		label: 'Medium',
		description: 'Balanced reasoning effort',
		headers: {},
		body: {},
		generation: {},
		options: { thinking: { type: 'enabled' }, reasoningEffort: 'medium' }
	},
	{
		id: 'low',
		label: 'Low',
		description: 'Light reasoning — faster responses',
		headers: {},
		body: {},
		generation: {},
		options: { thinking: { type: 'enabled' }, reasoningEffort: 'low' }
	},
	{
		id: 'disabled',
		label: 'Off',
		description: 'No chain-of-thought reasoning',
		headers: {},
		body: {},
		generation: {},
		options: { thinking: { type: 'disabled' } }
	}
];

export const BUILTIN_PROVIDERS: Record<ProviderId, ProviderInfo> = {
	groq: {
		id: 'groq' as ProviderId,
		name: 'Groq',
		enabled: false,
		env: ['GROQ_API_KEY'],
		api: { type: 'aisdk', package: '@ai-sdk/openai-compatible', url: 'https://api.groq.com/openai/v1' },
		request: { headers: {}, body: {} },
		description: 'Lightning fast utility execution',
		docUrl: 'https://console.groq.com/keys'
	},
	deepseek: {
		id: 'deepseek' as ProviderId,
		name: 'DeepSeek',
		enabled: false,
		env: ['DEEPSEEK_API_KEY'],
		api: { type: 'aisdk', package: '@ai-sdk/openai-compatible', url: 'https://api.deepseek.com' },
		request: { headers: {}, body: {} },
		description: 'Deep reasoning and code intelligence',
		docUrl: 'https://platform.deepseek.com/api_keys'
	},
	opencode: {
		id: 'opencode' as ProviderId,
		name: 'OpenCode Zen',
		enabled: false,
		env: ['OPENCODE_API_KEY'],
		api: { type: 'aisdk', package: '@ai-sdk/openai-compatible', url: 'https://opencode.ai/zen/v1' },
		request: { headers: {}, body: {} },
		description: 'Curated model endpoint for low-latency reasoning',
		docUrl: 'https://opencode.ai/docs/zen/'
	}
};

export const BUILTIN_MODELS: Record<ModelId, ModelInfo> = {
	'groq:openai/gpt-oss-120b': {
		id: 'groq:openai/gpt-oss-120b' as ModelId,
		providerId: 'groq' as ProviderId,
		name: 'GPT-OSS 120B',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: false, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'OpenAI open-source model on Groq'
	},
	'groq:llama-3.3-70b-versatile': {
		id: 'groq:llama-3.3-70b-versatile' as ModelId,
		providerId: 'groq' as ProviderId,
		name: 'Llama 3.3 70B',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: false, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 32_768 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Meta open model on Groq inference'
	},

	'groq:llama-3.1-8b-instant': {
		id: 'groq:llama-3.1-8b-instant' as ModelId,
		providerId: 'groq' as ProviderId,
		name: 'Llama 3.1 8B Instant',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: false, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'low',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Llama 3.1 8B Instant on Groq'
	},
	'groq:qwen/qwen3-32b': {
		id: 'groq:qwen/qwen3-32b' as ModelId,
		providerId: 'groq' as ProviderId,
		name: 'Qwen3 32B',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'mid',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Qwen mid-tier model on Groq'
	},
	'deepseek:deepseek-v4-flash': {
		id: 'deepseek:deepseek-v4-flash' as ModelId,
		providerId: 'deepseek' as ProviderId,
		name: 'DeepSeek V4 Flash',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: {
			headers: {},
			body: {},
			generation: { temperature: 1.0 },
			options: { thinking: { type: 'enabled' }, reasoningEffort: 'high' }
		},
		variants: DEEPSEEK_THINKING_VARIANTS,
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'speed',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Fast inference with strong reasoning'
	},
	'deepseek:deepseek-v4-pro': {
		id: 'deepseek:deepseek-v4-pro' as ModelId,
		providerId: 'deepseek' as ProviderId,
		name: 'DeepSeek V4 Pro',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: {
			headers: {},
			body: {},
			generation: { temperature: 1.0 },
			options: { thinking: { type: 'enabled' }, reasoningEffort: 'high' }
		},
		variants: DEEPSEEK_THINKING_VARIANTS,
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'DeepSeek flagship reasoning model'
	},
	// TODO(mastra-registry): `opencode:mimo-v2.5-free` is not in the Mastra
	// bundled registry as of @mastra/core@1.32.1. The V2 resolver will hand
	// it to the native router unchanged; if Mastra throws NoSuchModelError,
	// the new error handler surfaces a "try a different model" alert.
	// Revisit when the Mastra registry catches up.
	'opencode:mimo-v2.5-free': {
		id: 'opencode:mimo-v2.5-free' as ModelId,
		providerId: 'opencode' as ProviderId,
		name: 'Mimo V2.5 Free',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'mid',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Mimo V2.5 free via OpenCode Zen'
	},
	// TODO(mastra-registry): see above.
	'opencode:deepseek-v4-flash-free': {
		id: 'opencode:deepseek-v4-flash-free' as ModelId,
		providerId: 'opencode' as ProviderId,
		name: 'DeepSeek V4 Flash Free',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: DEEPSEEK_THINKING_VARIANTS,
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'speed',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'DeepSeek V4 Flash free via OpenCode Zen'
	},
	'opencode:nemotron-3-super-free': {
		id: 'opencode:nemotron-3-super-free' as ModelId,
		providerId: 'opencode' as ProviderId,
		name: 'Nemotron 3 Super Free',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'NVIDIA Nemotron 3 Super free via OpenCode Zen'
	},
	// TODO(mastra-registry): see above.
	'opencode:ring-2.6-1t-free': {
		id: 'opencode:ring-2.6-1t-free' as ModelId,
		providerId: 'opencode' as ProviderId,
		name: 'Ring 2.6 1T Free',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 128_000, output: 16_384 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Ring 2.6 1T free via OpenCode Zen'
	}
};

export function getProviderById(id: ProviderId): ProviderInfo | undefined {
	return BUILTIN_PROVIDERS[id];
}

/**
 * Build a `slashId → colonId` alias map once at module load. Used by
 * `getModelById` to accept either format (V1: `groq:llama-…`, V2: `groq/llama-…`).
 * Additive — V1 callers using the colon format are unaffected.
 */
const SLASH_TO_COLON_ALIAS: ReadonlyMap<string, ModelId> = new Map(
	Object.keys(BUILTIN_MODELS).map((colonId) => {
		const slashId = colonId.replace(/^([^:]+):/, '$1/');
		return [slashId, colonId as ModelId];
	})
);

export function getModelById(id: ModelId): ModelInfo | undefined {
	const direct = BUILTIN_MODELS[id];
	if (direct) return direct;
	const colonAlias = SLASH_TO_COLON_ALIAS.get(id);
	if (colonAlias) return BUILTIN_MODELS[colonAlias];
	return undefined;
}

export function getModelsByProvider(providerId: ProviderId): ModelInfo[] {
	return Object.values(BUILTIN_MODELS).filter((m) => m.providerId === providerId);
}

export function getChatRoutableModels(): ModelInfo[] {
	return Object.values(BUILTIN_MODELS);
}

export const SUPPORTED_PROVIDER_IDS = Object.keys(BUILTIN_PROVIDERS) as ProviderId[];

export const POPULAR_PROVIDER_IDS: ProviderId[] = ['groq', 'deepseek', 'opencode'];

/**
 * Platform-provided providers and models.
 *
 * These are NOT user-configured — they are env-keyed fallbacks the
 * platform ships with. The `getAllUserCredentials` function synthesizes
 * virtual credential rows for these at request time (sourced from env
 * keys), so they appear in the Settings UI under a "Platform Defaults"
 * section and in the model selector under a "Platform Defaults" group.
 *
 * The list mirrors BUILTIN_PROVIDERS / BUILTIN_MODELS so any model
 * the platform supports is also available as a platform default.
 */
export const PLATFORM_PROVIDERS: Record<ProviderId, ProviderInfo> = BUILTIN_PROVIDERS;
export const PLATFORM_MODELS: Record<ModelId, ModelInfo> = BUILTIN_MODELS;

/**
 * Community-curated overlay of well-known model metadata.
 *
 * When a user connects a CUSTOM provider (e.g. a self-hosted OpenAI-compatible
 * endpoint), their model ids won't be in BUILTIN_MODELS. To still render
 * the model name + variant list in the model selector trigger and the
 * chat composer variant dropdown SSR-side, we look the id up here first.
 *
 * For v1 this is seeded with the BUILTIN_MODELS only. Future versions can
 * add cross-provider ids (e.g. `openai/gpt-4o`, `anthropic/claude-sonnet-4-5`)
 * so a user connecting a custom OpenAI-compatible endpoint and selecting
 * one of these models gets full metadata.
 *
 * Lookup order for `resolveModelInfo`:
 *   1. BUILTIN_MODELS   (curated by us, fastest, full metadata)
 *   2. WELL_KNOWN_MODELS (community-curated overlay)
 *   3. user.discovered_models (per-user snapshot from the provider's own /models)
 */
export const WELL_KNOWN_MODELS: Record<ModelId, ModelInfo> = BUILTIN_MODELS;

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

export interface ResolveModelInfoOptions {
	userId?: number;
	db?: LibSQLDatabase<any>;
}

/**
 * Resolve a model id to its full ModelInfo. Pure function, SSR-safe.
 *
 * - Synchronous fast path: BUILTIN_MODELS + WELL_KNOWN_MODELS (both are
 *   pure data, so SSR can call this without DB access)
 * - Async extension: when `opts.userId` and `opts.db` are provided,
 *   also searches the user's `discovered_models` JSON snapshots
 *
 * Returns `null` if the model id is not in any of the three sources.
 */
export async function resolveModelInfo(
	id: string,
	opts: ResolveModelInfoOptions = {}
): Promise<ModelInfo | null> {
	if (!id) return null;

	const fast = BUILTIN_MODELS[id as ModelId] ?? WELL_KNOWN_MODELS[id as ModelId];
	if (fast) return fast;

	if (opts.userId && opts.db) {
		const { getDiscoveredModelsForUser } = await import(
			'$lib/server/mastra/provider/credentials'
		);
		const discovered = await getDiscoveredModelsForUser(opts.db, opts.userId);
		const found = discovered.get(id as ModelId);
		if (found) return found;
	}

	return null;
}
