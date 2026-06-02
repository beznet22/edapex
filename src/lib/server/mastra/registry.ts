export interface ModelDefinition {
	id: string;
	name: string;
	apiName: string;
	provider: string;
	description: string;
	tier: 'flagship' | 'pro' | 'mid' | 'speed' | 'lite' | 'reasoning' | 'omni' | 'low';
	classification: 'strong' | 'balanced' | 'simple';
	contextWindow: number;
	maxOutputTokens: number;
	capabilities: {
		supportsReasoning: boolean;
		supportsVision: boolean;
		supportsTools: boolean;
	};
}

export const MODEL_REGISTRY: ModelDefinition[] = [
	// ─── Opengateway: Xiaomi MiMo ─────────────────────────────────────────────
	{
		id: 'opengateway:mimo-v2.5-pro',
		name: 'MiMo v2.5 Pro',
		apiName: 'mimo-v2.5-pro',
		provider: 'opengateway',
		description: 'Flagship 1M context with deep reasoning and coding',
		tier: 'flagship',
		classification: 'strong',
		contextWindow: 1_000_000,
		maxOutputTokens: 128_000,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'opengateway:mimo-v2-pro',
		name: 'MiMo v2 Pro',
		apiName: 'mimo-v2-pro',
		provider: 'opengateway',
		description: 'Previous-gen professional model with 1M context',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 1_000_000,
		maxOutputTokens: 128_000,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'opengateway:mimo-v2.5',
		name: 'MiMo v2.5',
		apiName: 'mimo-v2.5',
		provider: 'opengateway',
		description: 'Flagship multimodal with vision and 1M context',
		tier: 'flagship',
		classification: 'strong',
		contextWindow: 1_000_000,
		maxOutputTokens: 128_000,
		capabilities: { supportsReasoning: true, supportsVision: true, supportsTools: true }
	},
	{
		id: 'opengateway:mimo-v2-omni',
		name: 'MiMo v2 Omni',
		apiName: 'mimo-v2-omni',
		provider: 'opengateway',
		description: 'Balanced multimodal model with 256K context',
		tier: 'omni',
		classification: 'balanced',
		contextWindow: 256_000,
		maxOutputTokens: 128_000,
		capabilities: { supportsReasoning: true, supportsVision: true, supportsTools: true }
	},
	{
		id: 'opengateway:mimo-v2-flash',
		name: 'MiMo v2 Flash',
		apiName: 'mimo-v2-flash',
		provider: 'opengateway',
		description: 'Fast inference optimized for speed',
		tier: 'speed',
		classification: 'balanced',
		contextWindow: 256_000,
		maxOutputTokens: 64_000,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},

	// ─── Opengateway: Google Gemini ────────────────────────────────────────────
	{
		id: 'opengateway:google/gemini-3.1-flash-lite-preview',
		name: 'Gemini 3.1 Flash Lite',
		apiName: 'google/gemini-3.1-flash-lite-preview',
		provider: 'opengateway',
		description: 'Lightweight vision model with 1M context via GMI Cloud',
		tier: 'lite',
		classification: 'balanced',
		contextWindow: 1_048_576,
		maxOutputTokens: 65_536,
		capabilities: { supportsReasoning: true, supportsVision: true, supportsTools: true }
	},

	// ─── Opengateway: Zhipu GLM ───────────────────────────────────────────────
	{
		id: 'opengateway:zai-org/GLM-5.1-FP8',
		name: 'GLM 5.1 FP8',
		apiName: 'zai-org/GLM-5.1-FP8',
		provider: 'opengateway',
		description: 'Chain-of-thought reasoning model with 200K context',
		tier: 'reasoning',
		classification: 'strong',
		contextWindow: 202_752,
		maxOutputTokens: 131_072,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},

	// ─── NVIDIA NIM ───────────────────────────────────────────────────────────
	{
		id: 'nvidia:minimaxai/minimax-m2.7',
		name: 'MiniMax M2.7',
		apiName: 'minimaxai/minimax-m2.7',
		provider: 'nvidia',
		description: 'MiniMax reasoning model via NVIDIA NIM',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'nvidia:stepfun-ai/step-3.5-flash',
		name: 'Step 3.5 Flash',
		apiName: 'stepfun-ai/step-3.5-flash',
		provider: 'nvidia',
		description: 'StepFun fast reasoning model via NVIDIA NIM',
		tier: 'speed',
		classification: 'balanced',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'nvidia:mistralai/mistral-large-3-675b-instruct-2512',
		name: 'Mistral Large 3 675B',
		apiName: 'mistralai/mistral-large-3-675b-instruct-2512',
		provider: 'nvidia',
		description: 'Mistral flagship via NVIDIA NIM',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'nvidia:qwen/qwen3-coder-480b-a35b-instruct',
		name: 'Qwen3 Coder 480B',
		apiName: 'qwen/qwen3-coder-480b-a35b-instruct',
		provider: 'nvidia',
		description: 'Qwen coding specialist via NVIDIA NIM',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},

	// ─── Groq (Native) ───────────────────────────────────────────────────────
	{
		id: 'groq:llama-3.3-70b-versatile',
		name: 'Llama 3.3 70B',
		apiName: 'llama-3.3-70b-versatile',
		provider: 'groq',
		description: 'Meta open model on Groq inference',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 32_768,
		capabilities: { supportsReasoning: false, supportsVision: false, supportsTools: true }
	},
	{
		id: 'groq:openai/gpt-oss-120b',
		name: 'GPT-OSS 120B',
		apiName: 'openai/gpt-oss-120b',
		provider: 'groq',
		description: 'OpenAI open-source model on Groq',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: false, supportsVision: false, supportsTools: true }
	},
	{
		id: 'groq:llama-3.1-8b-instant',
		name: 'Llama 3.1 8B Instant',
		apiName: 'llama-3.1-8b-instant',
		provider: 'groq',
		description: 'Llama 3.1 8B Instant on Groq',
		tier: 'low',
		classification: 'simple',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: false, supportsVision: false, supportsTools: true }
	},
	{
		id: 'groq:qwen/qwen3-32b',
		name: 'Qwen3 32B',
		apiName: 'qwen/qwen3-32b',
		provider: 'groq',
		description: 'Qwen mid-tier model on Groq',
		tier: 'mid',
		classification: 'balanced',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},

	// ─── DeepSeek (Native) ────────────────────────────────────────────────────
	{
		id: 'deepseek:deepseek-v4-flash',
		name: 'DeepSeek V4 Flash',
		apiName: 'deepseek-v4-flash',
		provider: 'deepseek',
		description: 'Fast inference with strong reasoning',
		tier: 'speed',
		classification: 'balanced',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'deepseek:deepseek-v4-pro',
		name: 'DeepSeek V4 Pro',
		apiName: 'deepseek-v4-pro',
		provider: 'deepseek',
		description: 'DeepSeek flagship reasoning model',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},

	// ─── OpenCode Zen (Free — API Key Required) ──────────────────────────────
	{
		id: 'opencode:mimo-v2.5-free',
		name: 'Mimo V2.5 Free',
		apiName: 'mimo-v2.5-free',
		provider: 'opencode',
		description: 'Mimo V2.5 free via OpenCode Zen',
		tier: 'mid',
		classification: 'balanced',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'opencode:deepseek-v4-flash-free',
		name: 'DeepSeek V4 Flash Free',
		apiName: 'deepseek-v4-flash-free',
		provider: 'opencode',
		description: 'DeepSeek V4 Flash free via OpenCode Zen',
		tier: 'speed',
		classification: 'balanced',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'opencode:nemotron-3-super-free',
		name: 'Nemotron 3 Super Free',
		apiName: 'nemotron-3-super-free',
		provider: 'opencode',
		description: 'NVIDIA Nemotron 3 Super free via OpenCode Zen',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},
	{
		id: 'opencode:ring-2.6-1t-free',
		name: 'Ring 2.6 1T Free',
		apiName: 'ring-2.6-1t-free',
		provider: 'opencode',
		description: 'Ring 2.6 1T free via OpenCode Zen',
		tier: 'pro',
		classification: 'strong',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: true, supportsVision: false, supportsTools: true }
	},


	// ─── Mistral (Native — Extraction Only) ───────────────────────────────────
	{
		id: 'mistral:mistral-ocr-latest',
		name: 'Mistral OCR',
		apiName: 'mistral-ocr-latest',
		provider: 'mistral',
		description: 'Document extraction specialist (not for chat routing)',
		tier: 'mid',
		classification: 'simple',
		contextWindow: 128_000,
		maxOutputTokens: 16_384,
		capabilities: { supportsReasoning: false, supportsVision: true, supportsTools: false }
	}
];

export function getModelById(id: string): ModelDefinition | undefined {
	return MODEL_REGISTRY.find(m => m.id === id);
}

export function getModelsByProvider(provider: string): ModelDefinition[] {
	return MODEL_REGISTRY.filter(m => m.provider === provider);
}

export function getModelsByClassification(classification: string): ModelDefinition[] {
	return MODEL_REGISTRY.filter(m => m.classification === classification);
}

export function getBestReasoningModel(): ModelDefinition | undefined {
	return MODEL_REGISTRY.filter(m => m.capabilities.supportsReasoning)
		.sort((a, b) => b.contextWindow - a.contextWindow)[0];
}

export function getBareModelName(id: string): string {
	const slashIndex = id.indexOf('/');
	return slashIndex === -1 ? id : id.slice(slashIndex + 1);
}

export function getChatRoutableModels(): ModelDefinition[] {
	return MODEL_REGISTRY.filter(m => m.id !== 'mistral/mistral-ocr-latest');
}

export const SUPPORTED_PROVIDERS = [
	'opengateway', 'nvidia', 'groq', 'deepseek', 'opencode', 'mistral'
] as const;



export type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

export interface AvailableModel {
	id: string;
	name: string;
	description: string;
	provider: string;
	source: 'db' | 'env';
}

/**
 * Returns the list of models available to a user based on their connected providers.
 * Includes conceptual models (Auto, Deep Reasoning) plus all registry models
 * whose provider is either 'opengateway' (always available) or connected by the user.
 */
export function getAvailableModels(
	connectedProviders: Array<{ provider: string; source: 'db' | 'env' }>
): AvailableModel[] {
	const connectedIds = new Set(connectedProviders.map(p => p.provider));
	const connectedSourceMap = new Map(connectedProviders.map(p => [p.provider, p.source] as const));

	const conceptualModels: AvailableModel[] = [
		{
			id: 'auto',
			name: 'Auto (Smart)',
			description: 'Smartly selects the best model for each task',
			provider: 'system',
			source: 'env'
		},
		{
			id: 'deep-reasoning',
			name: 'Deep Reasoning',
			description: 'Forces usage of the best available reasoning model',
			provider: 'system',
			source: 'env'
		}
	];

	const registryModels: AvailableModel[] = MODEL_REGISTRY.filter(m =>
		m.provider === 'opengateway' || connectedIds.has(m.provider)
	).map(m => ({
		id: m.id,
		name: m.name,
		description: m.description,
		provider: m.provider,
		source: connectedSourceMap.get(m.provider) || 'env'
	}));

	return [...conceptualModels, ...registryModels];
}
