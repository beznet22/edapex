/**
 * EdApex Gateway — MastraModelGateway Implementation
 *
 * Extends Mastra's native `MastraModelGateway` to provide:
 * - Per-user API key resolution from DB/env
 * - Provider URL construction for all supported providers
 * - Model instance creation (including opengateway special handling)
 *
 * This gateway is instantiated per-request with a unique ID to prevent
 * credential leakage between concurrent users. It is registered dynamically
 * via `mastra.addGateway(gateway, gateway.id)` in the API route handler.
 *
 * The old monolithic orchestration logic (stream, generate, executeExtraction)
 * has been removed. Orchestration is now handled by:
 * - `handleChatStream` in the API route (chat execution)
 * - `extractionWorkflow` in workflows/extraction.ts (document extraction)
 */
import { MastraModelGateway, type ProviderConfig, type GatewayLanguageModel } from '@mastra/core/llm';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './db/schema';
import {
    getProviderCredentialWithFallback,
    getAllActiveProviders,
    normalizeGatewayRequest,
    decrypt
} from './provider-config';
import { MODEL_REGISTRY, type ModelDefinition } from './registry';
import { resolveModelConfig } from '@mastra/core/llm';
import { env, env as svelteEnv } from '$env/dynamic/private';

// ─── Static URL Map ─────────────────────────────────────────────────────────

const BASE_URLS: Record<string, string> = {
    nvidia: 'https://integrate.api.nvidia.com/v1',
    groq: 'https://api.groq.com/openai/v1',
    deepseek: 'https://api.deepseek.com',
    opencode: 'https://opencode.ai/zen/v1',
    mistral: 'https://api.mistral.ai/v1',
    opengateway: 'https://opengateway.gitlawb.com/v1',
};

// ─── EdApex Gateway ─────────────────────────────────────────────────────────

export class EdApexGateway extends MastraModelGateway {
    readonly id = 'edapex';
    readonly name = 'EdApex Sovereign Gateway';
    private readonly encryptionKey = env.ENCRYPTION_KEY || '';
    private readonly envKeys: Record<string, string | undefined> = {
        OPENAI_API_KEY: env.OPENAI_API_KEY,
        ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
        GOOGLE_API_KEY: env.GOOGLE_API_KEY,
        DEEPSEEK_API_KEY: env.DEEPSEEK_API_KEY,
        GROQ_API_KEY: env.GROQ_API_KEY,
        NVIDIA_NIM_API_KEY: env.NVIDIA_NIM_API_KEY,
        MISTRAL_API_KEY: env.MISTRAL_API_KEY,
        OPENCODE_API_KEY: env.OPENCODE_API_KEY,
    };

    constructor(
        private readonly db: LibSQLDatabase<typeof schema>,
        private readonly userId: number
    ) {
        super();
    }

    /**
     * Fetch provider configurations from the EdApex model registry.
     * Groups MODEL_REGISTRY entries by provider and returns ProviderConfig shapes.
     */
    async fetchProviders(): Promise<Record<string, ProviderConfig>> {

        return MODEL_REGISTRY.reduce((providers, model) => {
            const provider = model.provider;
            if (!providers[provider]) {
                providers[provider] = {
                    name: provider,
                    models: [],
                    apiKeyEnvVar: `${provider.toUpperCase()}_API_KEY`,
                    gateway: this.id,
                    url: BASE_URLS[provider],
                };
            }
            providers[provider].models.push(model.apiName);
            return providers;
        }, {} as Record<string, ProviderConfig>);
    }

    /**
     * Retrieve and decrypt the API key for a given model ID.
     * Resolves from the user's DB credentials or env fallback.
     */
    async getApiKey(modelId: string): Promise<string> {
        console.log("[EdApexGateway] getApiKey", modelId);
        const provider = this.extractProvider(modelId);
        const config = await getProviderCredentialWithFallback(
            this.db, this.userId, provider, this.envKeys
        );
        if (!config) {
            // Opengateway is keyless — don't throw
            if (provider === 'opengateway') return 'keyless';
            throw new Error(`[EdApexGateway] No provider credential found for "${provider}"`);
        }

        if (!config.enabled) {
            throw new Error(`[EdApexGateway] Provider "${provider}" is disabled`);
        }

        if (config.source === 'env') {
            const envKey = provider === 'nvidia' ? 'NVIDIA_NIM_API_KEY' : `${provider.toUpperCase()}_API_KEY`;
            return this.envKeys[envKey] || '';
        }

        return decrypt(config.apiKeyEncrypted!, this.encryptionKey);
    }

    /**
     * Build the base URL for a specific model/provider combination.
     */
    buildUrl(modelId: string, envVars?: Record<string, string>): string | undefined {
        const provider = this.extractProvider(modelId);
        console.log("[EdApexGateway] buildUrl", provider, modelId);

        // Check for user-configured base URL first
        const envBaseUrl = envVars?.[`${provider.toUpperCase()}_BASE_URL`]
            || this.envKeys[`${provider.toUpperCase()}_BASE_URL`];
        if (envBaseUrl) return envBaseUrl;

        return BASE_URLS[provider];
    }

    /**
     * Resolve a language model instance from the gateway.
     * Handles the opengateway special case (createOpenAICompatible) and
     * falls through to Mastra's built-in resolveModelConfig for standard providers.
     */
    async resolveLanguageModel(args: {
        modelId: string;
        providerId: string;
        apiKey: string;
        headers?: Record<string, string>;
    }): Promise<GatewayLanguageModel> {
        const { modelId, providerId, apiKey } = args;
        console.log("[EdApexGateway] resolveLanguageModel", modelId, providerId, apiKey);

        // For opengateway: use createOpenAICompatible directly since "opengateway"
        // is not in Mastra's built-in ModelsDevGateway registry
        if (providerId === 'opengateway') {
            const bareModel = modelId.startsWith('opengateway/')
                ? modelId.slice('opengateway/'.length)
                : modelId;
            const baseURL = this.buildUrl(modelId) || BASE_URLS.opengateway;

            const provider = createOpenAICompatible({
                name: 'opengateway',
                apiKey: apiKey || 'keyless',
                baseURL,
                headers: { 'Accept-Encoding': 'identity' },
                supportsStructuredOutputs: false,
            });
            return provider.chatModel(bareModel) as unknown as GatewayLanguageModel;
        }

        // For opencode: use createOpenAICompatible directly — resolveModelConfig
        // rewrites opencode/ → openai/ which causes Mastra to route to api.openai.com
        if (providerId === 'opencode') {
            const bareModel = modelId.startsWith('opencode/')
                ? modelId.slice('opencode/'.length)
                : modelId;
            const baseURL = this.buildUrl(modelId) || BASE_URLS.opencode;

            const provider = createOpenAICompatible({
                name: 'opencode',
                apiKey,
                baseURL,
                headers: { 'Accept-Encoding': 'identity' },
                supportsStructuredOutputs: false,
            });
            return provider.chatModel(bareModel) as unknown as GatewayLanguageModel;
        }

        // For standard providers: use Mastra's resolveModelConfig
        const fullModelId = modelId.startsWith(`${providerId}/`) ? modelId : `${providerId}/${modelId}`;
        const baseOptions = {
            id: fullModelId as `${string}/${string}`,
            apiKey,
            baseURL: this.buildUrl(modelId) || undefined,
        };

        const config = normalizeGatewayRequest(providerId, baseOptions);
        const model = await resolveModelConfig(config);
        return model as unknown as GatewayLanguageModel;
    }

    /**
     * Execute a request with automatic provider failover.
     */
    async withFailover<T>(
        fn: (provider: string, apiKey: string, baseUrl?: string) => Promise<T>
    ): Promise<T> {
        const configs = await getAllActiveProviders(
            this.db, this.userId, this.envKeys,
            ['anthropic', 'openai', 'deepseek', 'groq']
        );
        const errors: Array<{ provider: string; error: unknown }> = [];

        for (const config of configs) {
            try {
                const apiKey = await this.getApiKey(config.provider);
                return await fn(config.provider, apiKey, config.baseUrl || undefined);
            } catch (error: unknown) {
                errors.push({ provider: config.provider, error });
                continue;
            }
        }

        throw new Error(
            `[EdApexGateway] All providers exhausted. Errors: ${errors.map((e) => `${e.provider}: ${e.error}`).join(', ')}`
        );
    }

    /**
     * Extract the provider name from a model ID string.
     * Handles formats like "opengateway/mimo-v2.5-pro" or "nvidia/model-name".
     */
    extractProvider(modelId: string): string {
        const parts = modelId.split('/');
        const lastPart = parts[parts.length - 1];
        const model = MODEL_REGISTRY.find(m => m.apiName === lastPart);
        if (model) return model.provider;

        if (parts[0] === 'edapex' && parts.length > 1) {
            return parts[1];
        }

        return parts[0] || 'opengateway';
    }
}
