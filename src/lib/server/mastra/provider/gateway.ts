/**
 * EdApex Gateway — MastraModelGateway Implementation
 *
 * Per-user gateway that:
 * 1. Resolves credentials via the singleton DB (no constructor db param)
 * 2. Uses the provider catalog (BUILTIN_PROVIDERS) for default URL + API spec
 * 3. Resolves a language model via ProviderAdapter map
 *    - DeepSeek uses @ai-sdk/deepseek (not openai-compatible, fixes the
 *      `messages[N]: missing field content` bug)
 *    - Other AI-SDK providers use @ai-sdk/openai-compatible
 *    - Custom providers use @ai-sdk/openai-compatible with user-supplied baseURL
 *
 * This gateway is instantiated per-request and registered dynamically via
 * `mastra.addGateway(gateway, `edapex-${userId}`)` in API route handlers.
 */
import { MastraModelGateway, type GatewayLanguageModel } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import {
	resolveApiKeyForCredential,
	getUserCredential,
	decryptCustomProvider
} from './credentials';
import { getProviderById, BUILTIN_PROVIDERS } from './catalog';
import { ProviderNotFoundError, NoCredentialError, ProviderDisabledError, InitError } from './errors';
import type { ProviderId } from './types';
import { env as svelteEnv } from '$env/dynamic/private';

function getEnv(): Record<string, string | undefined> {
	return svelteEnv as Record<string, string | undefined>;
}

function getEnvKeyForProvider(providerId: ProviderId): string {
	return providerId === 'nvidia' ? 'NVIDIA_NIM_API_KEY' : `${providerId.toUpperCase()}_API_KEY`;
}

export class EdApexGateway extends MastraModelGateway {
	readonly id = 'edapex';
	readonly name = 'EdApex Sovereign Gateway';

	private readonly encryptionKey: string;
	private readonly envKeys: Record<string, string | undefined>;
	private readonly customProviders = new Map<string, ReturnType<typeof buildCustomProviderInfo>>();

	constructor(
		private readonly userId: number,
		encryptionKey?: string,
		envKeysOverride?: Record<string, string | undefined>
	) {
		super();
		this.encryptionKey =
			encryptionKey ?? svelteEnv.TOKEN_ENCRYPTION_KEY ?? svelteEnv.ENCRYPTION_KEY ?? '';
		this.envKeys = {
			OPENAI_API_KEY: svelteEnv.OPENAI_API_KEY,
			ANTHROPIC_API_KEY: svelteEnv.ANTHROPIC_API_KEY,
			GOOGLE_API_KEY: svelteEnv.GOOGLE_API_KEY,
			DEEPSEEK_API_KEY: svelteEnv.DEEPSEEK_API_KEY,
			GROQ_API_KEY: svelteEnv.GROQ_API_KEY,
			NVIDIA_NIM_API_KEY: svelteEnv.NVIDIA_NIM_API_KEY,
			MISTRAL_API_KEY: svelteEnv.MISTRAL_API_KEY,
			OPENCODE_API_KEY: svelteEnv.OPENCODE_API_KEY,
			...envKeysOverride
		};
	}

	async fetchProviders() {
		return Object.values(BUILTIN_PROVIDERS).reduce(
			(acc, p) => {
				acc[p.id] = {
					name: p.name,
					models: [],
					apiKeyEnvVar: p.env,
					gateway: this.id,
					url: p.api.type === 'aisdk' ? p.api.url : undefined
				};
				return acc;
			},
			{} as Record<string, { name: string; models: string[]; apiKeyEnvVar: string | string[]; gateway: string; url?: string }>
		);
	}

	async buildUrl(modelId: string): Promise<string | undefined> {
		const providerId = this.extractProviderId(modelId);
		const provider = getProviderById(providerId);
		if (!provider) return undefined;
		if (provider.api.type === 'aisdk') return provider.api.url;
		if (provider.api.type === 'native') return provider.api.url;
		return undefined;
	}

	async getApiKey(modelId: string): Promise<string> {
		const providerId = this.extractProviderId(modelId);
		const db = getAppDb();
		const credential = await getUserCredential(db, getEnv(), this.userId, providerId);
		const apiKey = resolveApiKeyForCredential(credential ?? null, getEnv(), providerId);
		if (!apiKey) {
			throw new NoCredentialError(providerId);
		}
		if (credential && credential.enabled === 0) {
			throw new ProviderDisabledError(providerId);
		}
		return apiKey;
	}

	/**
	 * Resolve a language model instance.
	 * Routes to the correct AI-SDK factory per provider:
	 * - DeepSeek: @ai-sdk/deepseek (NOT openai-compatible — bug fix)
	 * - Opengateway: @ai-sdk/openai-compatible
	 * - OpenCode: @ai-sdk/openai-compatible
	 * - All other AI-SDK providers: @ai-sdk/openai-compatible
	 * - Custom: @ai-sdk/openai-compatible with user baseURL + headers
	 */
	async resolveLanguageModel(args: {
		modelId: string;
		providerId: string;
		apiKey: string;
		headers?: Record<string, string>;
	}): Promise<GatewayLanguageModel> {
		const { modelId, providerId, apiKey } = args;
		const baseURL = await this.buildUrl(modelId);

		// Custom providers
		if (providerId.startsWith('custom:')) {
			return this.resolveCustomModel(providerId, modelId, apiKey);
		}

		// DeepSeek uses its own dedicated package to avoid the openai-compatible
		// `messages[N]: missing field content` deserialization bug.
		if (providerId === 'deepseek') {
			const deepseek = createDeepSeek({
				apiKey,
				baseURL: baseURL ?? 'https://api.deepseek.com',
				headers: args.headers
			});
			return deepseek(modelId) as unknown as GatewayLanguageModel;
		}

		// All other AI-SDK-compatible providers go through openai-compatible
		const provider = createOpenAICompatible({
			name: providerId,
			apiKey: apiKey || 'keyless',
			baseURL: baseURL ?? 'https://api.openai.com/v1',
			headers: args.headers,
			supportsStructuredOutputs: false
		});
		return provider.chatModel(modelId) as unknown as GatewayLanguageModel;
	}

	private async resolveCustomModel(
		providerId: string,
		modelId: string,
		apiKey: string
	): Promise<GatewayLanguageModel> {
		const id = providerId.slice('custom:'.length) as ProviderId;
		const db = getAppDb();
		const credential = await getUserCredential(db, getEnv(), this.userId, id);
		if (!credential || !credential.encryptedData) {
			throw new NoCredentialError(id);
		}
		const custom = decryptCustomProvider(credential.encryptedData, getEnv());
		if (!custom) {
			throw new InitError(id, 'Failed to decrypt custom provider config');
		}

		const baseURL = custom.baseUrl.endsWith('/v1') ? custom.baseUrl : custom.baseUrl.replace(/\/+$/, '') + '/v1';

		// Apply custom headers (e.g. auth via headers instead of api key)
		const customHeaderEntries: Record<string, string> = {};
		for (const h of custom.headers) {
			customHeaderEntries[h.name] = h.value;
		}

		const provider = createOpenAICompatible({
			name: id,
			apiKey: apiKey || customHeaderEntries['Authorization']?.replace(/^Bearer\s+/i, '') || 'keyless',
			baseURL,
			headers: customHeaderEntries,
			supportsStructuredOutputs: false
		});
		return provider.chatModel(modelId) as unknown as GatewayLanguageModel;
	}

	/**
	 * Extract provider name from a model ID. Model IDs follow `providerId/modelName`
	 * format, except for OpenRouter-style nested IDs which keep their slashes.
	 * Falls back to using the input itself as the provider id when no slash
	 * is present (matches the old `extractProvider` behavior, which was used
	 * to call `gateway.getApiKey('cerebras')` for direct provider lookups).
	 */
	extractProviderId(modelId: string): string {
		if (modelId.includes('/')) {
			const [head, ...rest] = modelId.split('/');
			if (head === 'custom' && rest.length > 0) {
				return `custom:${rest[0]}`;
			}
			return head ?? '';
		}
		return modelId || '';
	}
}

function buildCustomProviderInfo(_id: string) {
	return { id: _id };
}
