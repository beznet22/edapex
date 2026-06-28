/**
 * Built-in provider and model catalog — single source of truth.
 *
 * Pure data — safe to import in client and server contexts.
 * Source of truth for which providers and models the platform natively supports.
 * Custom providers (user-defined) are NOT in this catalog; they are loaded at
 * runtime from `user_credentials` and merged into a per-request registry.
 *
 * ID format: slash (e.g. `groq/llama-3.3-70b-versatile`). This matches the
 * Mastra native router's expected `<provider>/<model>` shape and the V2
 * `selected-model` cookie. Colon format (`groq:llama-3.3-70b-versatile`) is
 * read-only for legacy cookies, threads.metadata.model, and orphaned DB rows
 * via the `COLON_TO_SLASH_ALIAS` map below.
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
	},
	kimchi: {
		id: 'kimchi' as ProviderId,
		name: 'Kimchi',
		enabled: false,
		env: ['KIMCHI_API_KEY'],
		api: { type: 'aisdk', package: '@ai-sdk/openai-compatible', url: 'https://llm.kimchi.dev/openai/v1' },
		// `User-Agent: kimchi/dev` is the safety-net static value. The dynamic
		// resolver in `provider/dynamic-headers.ts` overrides it at request
		// time with `kimchi/<semver>` once the version cache warms up.
		// Without the dynamic layer, the upstream rejects requests with a
		// misleading "credits exhausted" error body (verified live).
		request: { headers: { 'User-Agent': 'kimchi/dev' }, body: {} },
		description: 'Cast AI proxy — multi-model router with reasoning + vision',
		docUrl: 'https://llm.kimchi.dev'
	}
};

export const BUILTIN_MODELS: Record<ModelId, ModelInfo> = {
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
	},
	// ────────────────────────────────────────────────────────────────────
	// Kimchi — models surfaced from the upstream metadata endpoint
	// (llm.kimchi.dev/v1/models/metadata?include_in_cli=true). The hardcoded
	// values here are a snapshot taken at provisioning time; if the upstream
	// adds or retires models, refresh this block. Capabilities mirror the
	// `tool_call`, `reasoning`, `supports_images`, and `input_modalities`
	// fields from the metadata response.
	// ────────────────────────────────────────────────────────────────────
	'kimchi/minimax-m3': {
		id: 'kimchi/minimax-m3' as ModelId,
		providerId: 'kimchi' as ProviderId,
		name: 'Minimax M3',
		capabilities: { tools: true, input: ['text/*', 'image/*'], output: ['text/*'], reasoning: true, vision: true },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 1_048_576, output: 1_048_576 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Minimax M3 via Kimchi — 1M context, multimodal, reasoning'
	},
	'kimchi/kimi-k2.7': {
		id: 'kimchi/kimi-k2.7' as ModelId,
		providerId: 'kimchi' as ProviderId,
		name: 'Kimi K2.7',
		capabilities: { tools: true, input: ['text/*', 'image/*'], output: ['text/*'], reasoning: true, vision: true },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 262_144, output: 262_144 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Kimi K2.7 via Kimchi — 256K context, multimodal, reasoning'
	},
	'kimchi/kimi-k2.6': {
		id: 'kimchi/kimi-k2.6' as ModelId,
		providerId: 'kimchi' as ProviderId,
		name: 'Kimi K2.6',
		capabilities: { tools: true, input: ['text/*', 'image/*'], output: ['text/*'], reasoning: true, vision: true },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 262_144, output: 262_144 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Kimi K2.6 via Kimchi — 256K context, multimodal, reasoning'
	},
	'kimchi/minimax-m2.7': {
		id: 'kimchi/minimax-m2.7' as ModelId,
		providerId: 'kimchi' as ProviderId,
		name: 'MiniMax M2.7',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 196_608, output: 196_608 },
		tier: 'mid',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Secondary subagent for code generation and debugging.'
	},
	'kimchi/nemotron-3-ultra-fp4': {
		id: 'kimchi/nemotron-3-ultra-fp4' as ModelId,
		providerId: 'kimchi' as ProviderId,
		name: 'Nemotron 3 Ultra FP4',
		capabilities: { tools: true, input: ['text/*'], output: ['text/*'], reasoning: true, vision: false },
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active',
		enabled: true,
		limit: { context: 1_048_576, output: 1_048_576 },
		tier: 'pro',
		cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
		description: 'Nemotron 3 Ultra FP4 via Kimchi — 1M context, text, reasoning'
	}
};

/**
 * Legacy colon → canonical slash alias map. Built once at module load from
 * the canonical `BUILTIN_MODELS` keys. `getModelById` consults this map
 * after a direct slash lookup misses, so legacy cookies and orphaned DB
 * rows continue to resolve. Never write colon-format ids back to storage
 * or the cookie — the SSR layout rewrites them on read.
 */
const COLON_TO_SLASH_ALIAS: ReadonlyMap<string, ModelId> = new Map(
	Object.keys(BUILTIN_MODELS).map((slashId) => {
		const colonId = slashId.replace(/^([^/]+)\//, '$1:');
		return [colonId, slashId as ModelId];
	})
);

export function getProviderById(id: ProviderId): ProviderInfo | undefined {
	return BUILTIN_PROVIDERS[id];
}

export function getModelById(id: ModelId): ModelInfo | undefined {
	const direct = BUILTIN_MODELS[id];
	if (direct) return direct;
	const slashAlias = COLON_TO_SLASH_ALIAS.get(id);
	if (slashAlias) return BUILTIN_MODELS[slashAlias];
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
 * Default model id used by `pickDefaultModelId` when the cookie is empty.
 * Pinned to `groq/openai/gpt-oss-120b` — a 120B-parameter OpenAI-OSS
 * model served via Groq at low cost, suitable as a first-paint default
 * before the user picks a preferred model.
 */
export const DEFAULT_MODEL_ID: ModelId = 'groq/openai/gpt-oss-120b' as ModelId;

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


