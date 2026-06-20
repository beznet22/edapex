/**
 * Built-in provider and model catalog — V2 (server-only).
 *
 * Mirrors the V1 catalog but uses the Mastra-native `provider/model` format
 * for model ids (e.g., `groq/llama-3.3-70b-versatile`) instead of the
 * V1 `provider:model` colon format. The catalog id is the model id passed
 * to the native Mastra router.
 *
 * V1 stays unchanged at `$lib/server/mastra/provider/catalog.ts` until the
 * cutover PR removes it.
 */
import type { ProviderInfo, ModelInfo, Variant } from '$lib/provider/spec';
import type { ProviderId, ModelId } from '$lib/provider/types';

/**
 * Shared thinking-mode variants for any DeepSeek V4 model, regardless of
 * which provider surfaces it (deepseek direct, opencode:zen proxy, etc.).
 *
 * Matches the DeepSeek Thinking API: `thinking.enabled` toggle +
 * `reasoning_effort` ∈ { 'high', 'medium', 'low' }.
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
		// `package` is read by resolver.ts to decide which AI-SDK
		// factory (if any) to wrap the request in.
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
	'groq/llama-3.3-70b-versatile': {
		id: 'groq/llama-3.3-70b-versatile' as ModelId,
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
	'groq/openai/gpt-oss-120b': {
		id: 'groq/openai/gpt-oss-120b' as ModelId,
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
	'groq/llama-3.1-8b-instant': {
		id: 'groq/llama-3.1-8b-instant' as ModelId,
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
	'groq/qwen/qwen3-32b': {
		id: 'groq/qwen/qwen3-32b' as ModelId,
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
	'deepseek/deepseek-v4-flash': {
		id: 'deepseek/deepseek-v4-flash' as ModelId,
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
	'deepseek/deepseek-v4-pro': {
		id: 'deepseek/deepseek-v4-pro' as ModelId,
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
	// TODO(mastra-registry): `opencode/mimo-v2.5-free` is not in the Mastra
	// bundled registry as of @mastra/core@1.32.1. The resolver will hand it
	// to the native router unchanged; if Mastra throws NoSuchModelError, the
	// new error handler surfaces a "try a different model" alert. Revisit
	// when the Mastra registry catches up.
	'opencode/mimo-v2.5-free': {
		id: 'opencode/mimo-v2.5-free' as ModelId,
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
	'opencode/deepseek-v4-flash-free': {
		id: 'opencode/deepseek-v4-flash-free' as ModelId,
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
	'opencode/nemotron-3-super-free': {
		id: 'opencode/nemotron-3-super-free' as ModelId,
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
	'opencode/ring-2.6-1t-free': {
		id: 'opencode/ring-2.6-1t-free' as ModelId,
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

export function getModelById(id: ModelId): ModelInfo | undefined {
	return BUILTIN_MODELS[id];
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
 * Default model id used by `pickDefaultModelId` when the cookie is empty.
 * Pinned to `groq/openai/gpt-oss-120b` — a 120B-parameter OpenAI-OSS
 * model served via Groq at low cost, suitable as a first-paint default
 * before the user picks a preferred model.
 */
export const DEFAULT_MODEL_ID: ModelId = 'groq/openai/gpt-oss-120b' as ModelId;

/**
 * Platform-provided providers and models.
 *
 * V1 synthesized these at request time; V2 leaves platform-default
 * resolution to the resolver's env-fallback path. The map is kept here
 * for UI consumers that want to iterate platform defaults.
 */
export const PLATFORM_PROVIDERS: Record<ProviderId, ProviderInfo> = BUILTIN_PROVIDERS;
export const PLATFORM_MODELS: Record<ModelId, ModelInfo> = BUILTIN_MODELS;
