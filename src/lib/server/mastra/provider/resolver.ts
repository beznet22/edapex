/**
 * Model resolver — V2.
 *
 * The single entry point between the cookie value (`<provider>/<model>@<variant>`)
 * and the agent's `model` callback. Resolves a model into one of two
 * `MastraModelConfig` shapes (both accepted by `agent.model`):
 *
 *   1. `OpenAICompatibleConfig` object — for any provider whose catalog entry
 *      declares `provider.api.package === '@ai-sdk/openai-compatible'` (Groq,
 *      OpenCode Zen, DeepSeek via the OpenAI-compatible DeepSeek API). The
 *      native Mastra router resolves this against `provider.api.url`,
 *      `provider.api.apiKey`, and a `customFetch` that captures rate-limit
 *      headers uniformly.
 *
 *   2. `ModelRouterModelId` string (env-keyed fallback) — returned by
 *      `pickDefaultModelId` when the cookie is empty and no user credential
 *      is configured.
 *
 * The variant suffix is a UI label; the resolver extracts it and returns
 * the variant's `options` as `providerOptions[providerId]` for the caller
 * to pass as `agent.stream(..., { providerOptions })`.
 */
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { env as svelteEnv } from '$env/dynamic/private';
import type { MastraModelConfig } from '@mastra/core/llm';
import { BUILTIN_PROVIDERS, BUILTIN_MODELS, DEFAULT_MODEL_ID, getModelById, getChatRoutableModels } from '$lib/provider/catalog';
import {
	NoCredentialError,
	NoProvidersError,
	ProviderDisabledError,
	ProviderNotFoundError,
	ModelNotFoundError
} from './errors';
import { resolveProviderKey } from './credentials';
import { createRateLimitFetch } from './rate-limit';
import type { ProviderId, ModelId, VariantId } from './types';
import { parseModelId } from './types';
import type { ModelInfo, Capabilities } from './spec';

function getEnv(): Record<string, string | undefined> {
	return svelteEnv as Record<string, string | undefined>;
}

export interface ResolvedRequestModel {
	/** Pass directly as `agent.model`. */
	config: MastraModelConfig;
	/** Variant options for `agent.stream(..., { providerOptions })`. */
	providerOptions?: Record<string, Record<string, unknown>>;
	/** UI fields (not used by the agent). */
	providerId: ProviderId;
	modelName: string;
	variantId: VariantId | null;
	capabilities: Capabilities;
	limit: ModelInfo['limit'];
	/** Where the API key came from. */
	keySource: 'user' | 'env' | null;
}

/**
 * Build the model for a given provider id. Provider-specific factory is
 * picked from `provider.api.package` (data, not control flow) so future
 * providers slot in without resolver changes.
 *
 * Static, provider-wide headers come from `provider.request.headers` and
 * `modelInfo.request.headers` (model-level overrides provider-level).
 * Dynamic per-request headers (e.g. versioned `User-Agent`) are layered on
 * top inside `createRateLimitFetch` via the `HEADER_RESOLVERS` registry.
 */
function buildModel(
	providerId: ProviderId,
	provider: (typeof BUILTIN_PROVIDERS)[ProviderId],
	modelName: string,
	apiKey: string,
	customFetch: typeof fetch,
	modelInfo?: ModelInfo
): MastraModelConfig {
	const api = provider.api;
	const headers = {
		...provider.request.headers,
		...(modelInfo?.request.headers ?? {})
	};
	if (api.type === 'native') {
		// No catalog entry should ever have a native API today; the catalog
		// only contains AI-SDK-backed providers. Defensive fallback: build
		// an openai-compatible config so the agent at least gets a model.
		return {
			id: `${providerId}/${modelName}`,
			url: api.url,
			apiKey,
			headers,
			fetch: customFetch
		} as unknown as MastraModelConfig;
	}
	return {
		id: `${providerId}/${modelName}`,
		url: api.url,
		apiKey,
		headers,
		fetch: customFetch
	} as unknown as MastraModelConfig;
}

export async function resolveModelForRequest(
	userId: number,
	modelIdWithVariant: string,
	db: LibSQLDatabase<any>
): Promise<ResolvedRequestModel> {
	if (!modelIdWithVariant) {
		throw new NoProvidersError();
	}

	const { modelId, variantId } = parseModelId(modelIdWithVariant);
	const providerId = extractProviderId(modelId);
	if (!providerId) {
		throw new ModelNotFoundError('unknown' as ProviderId, modelId as ModelId);
	}

	const provider = BUILTIN_PROVIDERS[providerId];
	if (!provider) {
		throw new ProviderNotFoundError(providerId);
	}

	const modelName = stripProviderPrefix(modelId, providerId);
	if (!modelName) {
		throw new ModelNotFoundError(providerId, modelId as ModelId);
	}

	const modelInfo = getModelById(modelId as ModelId);
	if (!modelInfo) {
		throw new ModelNotFoundError(providerId, modelId as ModelId);
	}

	const resolved = await resolveProviderKey(db, getEnv(), userId, providerId);
	if (!resolved) {
		throw new NoCredentialError(providerId);
	}
	if (resolved.credentialEnabled === false) {
		throw new ProviderDisabledError(providerId);
	}

	const customFetch = await createRateLimitFetch(userId, providerId, getEnv());
	const config = buildModel(providerId, provider, modelName, resolved.apiKey, customFetch, modelInfo);

	const providerOptions = resolveProviderOptions(modelInfo, variantId);

	return {
		config,
		providerOptions,
		providerId,
		modelName,
		variantId,
		capabilities: modelInfo.capabilities,
		limit: modelInfo.limit,
		keySource: resolved.source
	};
}

/**
 * Pick a sensible default model id when the cookie is empty. Used by the
 * SSR layout's auto-pick to render the chat composer with a real model
 * on first paint. Returns `<provider>/<model>@<variant>` format (or
 * `<provider>/<model>` if no variants).
 *
 * Resolution order:
 *   1. If `DEFAULT_MODEL_ID` (in the catalog) is connected, return it
 *      with its first variant (if any). The default is the OpenAI-OSS
 *      120B model on Groq.
 *   2. Otherwise iterate `BUILTIN_MODELS` in catalog order, returning
 *      the first model whose provider has a connected credential.
 *   3. If no candidates, return `null`.
 */
export async function pickDefaultModelId(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number
): Promise<string | null> {
	const preferred = BUILTIN_MODELS[DEFAULT_MODEL_ID];
	if (preferred) {
		const resolved = await resolveProviderKey(db, env, userId, preferred.providerId);
		if (resolved) {
			const firstVariantId = preferred.variants[0]?.id;
			const variantSuffix = firstVariantId ? `@${firstVariantId}` : '';
			return `${preferred.id}${variantSuffix}`;
		}
	}
	for (const model of getChatRoutableModels()) {
		if (model.id === DEFAULT_MODEL_ID) continue;
		const resolved = await resolveProviderKey(db, env, userId, model.providerId);
		if (!resolved) continue;
		const firstVariantId = model.variants[0]?.id;
		const variantSuffix = firstVariantId ? `@${firstVariantId}` : '';
		return `${model.id}${variantSuffix}`;
	}
	return null;
}

function resolveProviderOptions(
	model: ModelInfo,
	variantId: VariantId | null
): Record<string, Record<string, unknown>> | undefined {
	if (!variantId) return undefined;
	const variant = model.variants.find((v) => v.id === variantId);
	if (!variant || !variant.options || Object.keys(variant.options).length === 0) return undefined;
	return { [model.providerId]: variant.options };
}

/**
 * Extract the provider segment from a model id. Accepts both canonical
 * slash (`groq/llama-3.3-70b-versatile`) and legacy colon
 * (`groq:llama-3.3-70b-versatile`). Slash is tried first; colon is the
 * fallback for legacy cookies, threads.metadata.model, and orphaned DB
 * rows that pre-date the V2 cutover. For nested model names like
 * `groq/qwen/qwen3-32b` the model name keeps its inner `/` (correctly
 * nested for the OpenAI-compat factory).
 */
function extractProviderId(modelId: string): ProviderId | null {
	const slashIdx = modelId.indexOf('/');
	if (slashIdx > 0) return modelId.slice(0, slashIdx) as ProviderId;
	const colonIdx = modelId.indexOf(':');
	if (colonIdx > 0) return modelId.slice(0, colonIdx) as ProviderId;
	return null;
}

function stripProviderPrefix(modelId: string, providerId: ProviderId): string {
	const slashPrefix = `${providerId}/`;
	if (modelId.startsWith(slashPrefix)) return modelId.slice(slashPrefix.length);
	const colonPrefix = `${providerId}:`;
	if (modelId.startsWith(colonPrefix)) return modelId.slice(colonPrefix.length);
	return '';
}
