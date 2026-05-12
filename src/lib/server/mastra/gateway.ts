import type { Client } from '@libsql/client';
import {
	decrypt,
	getProviderConfig,
	getAllProviderConfigs,
	type TaskMappings
} from './provider-config';

/** Base URLs for each supported AI provider */
const BASE_URLS: Record<string, string> = {
	cerebras: 'https://api.cerebras.ai/v1',
	groq: 'https://api.groq.com/openai/v1',
	nvidia: 'https://integrate.api.nvidia.com/v1',
	mistral: 'https://api.mistral.ai/v1'
};

/**
 * EdApex Sovereign Gateway — libSQL-native provider routing.
 *
 * Replaces the legacy MySQL/filesystem-backed router.
 * Instantiated per-request, reads config from mastra.db,
 * and supports automatic failover on 429/500/503.
 *
 * NOTE: This does NOT extend MastraModelGateway at module scope
 * to avoid importing heavy AI SDK dependencies in unit tests.
 * Integration with Mastra's gateway registry will happen in the
 * full Mastra instance wiring (Phase 1.2 integration).
 */
export class EdApexGateway {
	constructor(
		private readonly client: Client,
		private readonly encryptionKey: string
	) {}

	readonly id = 'edapex';
	readonly name = 'EdApex Sovereign Gateway';

	/**
	 * Retrieve and decrypt the API key for a given model ID.
	 * Model ID format: `edapex/[provider]/[model]` or just `[provider]`
	 */
	async getApiKey(modelId: string): Promise<string> {
		const providerId = this.parseProviderId(modelId);
		const config = await getProviderConfig(this.client, providerId);

		if (!config) {
			throw new Error(`[EdApexGateway] No provider config found for "${providerId}"`);
		}

		if (!config.enabled) {
			throw new Error(`[EdApexGateway] Provider "${providerId}" is disabled`);
		}

		return decrypt(config.apiKeyEncrypted, this.encryptionKey);
	}

	/**
	 * Build the base URL for a provider.
	 */
	buildUrl(modelId: string): string {
		const providerId = this.parseProviderId(modelId);
		const url = BASE_URLS[providerId];

		if (!url) {
			throw new Error(`[EdApexGateway] No base URL configured for "${providerId}"`);
		}

		return url;
	}

	/**
	 * Resolve the best model ID for a given task type,
	 * using the priority-ordered provider configs from libSQL.
	 */
	async resolveModelForTask(
		task: keyof TaskMappings
	): Promise<{ providerId: string; modelId: string }> {
		const configs = await getAllProviderConfigs(this.client);

		for (const config of configs) {
			const mappings: TaskMappings = JSON.parse(config.taskMappings);
			const model = mappings[task];

			if (model) {
				return { providerId: config.id, modelId: model };
			}
		}

		throw new Error(`[EdApexGateway] No provider configured for task "${task}"`);
	}

	/**
	 * Get all enabled providers in priority order for failover.
	 */
	async getFailoverChain(): Promise<string[]> {
		const configs = await getAllProviderConfigs(this.client);
		return configs.map((c) => c.id);
	}

	/**
	 * Execute a request with automatic failover on 429/500/503.
	 * Rotates through the provider hierarchy.
	 */
	async withFailover<T>(
		fn: (providerId: string, apiKey: string, baseUrl: string) => Promise<T>
	): Promise<T> {
		const chain = await this.getFailoverChain();
		const errors: Array<{ provider: string; error: unknown }> = [];

		for (const providerId of chain) {
			try {
				const apiKey = await this.getApiKey(providerId);
				const baseUrl = this.buildUrl(providerId);
				return await fn(providerId, apiKey, baseUrl);
			} catch (error: unknown) {
				const statusCode = extractStatusCode(error);
				const isRetryable = statusCode === 429 || statusCode === 500 || statusCode === 503;

				if (isRetryable && chain.indexOf(providerId) < chain.length - 1) {
					errors.push({ provider: providerId, error });
					continue;
				}

				throw error;
			}
		}

		throw new Error(
			`[EdApexGateway] All providers exhausted. Errors: ${errors.map((e) => `${e.provider}: ${e.error}`).join(', ')}`
		);
	}

	/**
	 * Parse the provider ID from a model identifier.
	 * Supports: `edapex/cerebras/llama-3`, `cerebras/llama-3`, or just `cerebras`
	 */
	private parseProviderId(modelId: string): string {
		const parts = modelId.split('/');

		if (parts[0] === 'edapex' && parts.length >= 2) {
			return parts[1];
		}

		if (parts.length >= 2) {
			return parts[0];
		}

		return modelId;
	}
}

function extractStatusCode(error: unknown): number | null {
	if (error && typeof error === 'object') {
		if ('statusCode' in error) return (error as { statusCode: number }).statusCode;
		if ('status' in error) return (error as { status: number }).status;
		if ('code' in error) {
			const code = (error as { code: unknown }).code;
			if (typeof code === 'number' && code >= 100 && code < 600) return code;
		}
	}
	return null;
}
