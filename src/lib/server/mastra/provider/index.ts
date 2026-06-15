/**
 * Provider module barrel — V2 (server-only).
 *
 * Slimmer surface than V1: callers import only the two resolver
 * functions plus the data needed to build a UI (BUILTIN_PROVIDERS,
 * BUILTIN_MODELS, errors). The rate-limit, credentials, and discovery
 * modules are imported internally by the resolver; they're not
 * re-exported here because no caller outside this directory should
 * reach for them directly.
 */
export {
	resolveModelForRequest,
	pickDefaultModelId,
	type ResolvedRequestModel
} from './resolver';

export {
	BUILTIN_PROVIDERS,
	BUILTIN_MODELS,
	DEFAULT_MODEL_ID,
	getProviderById,
	getModelById,
	getModelsByProvider,
	getChatRoutableModels,
	POPULAR_PROVIDER_IDS,
	PLATFORM_PROVIDERS,
	PLATFORM_MODELS
} from './catalog';

export {
	saveUserCredential,
	getUserCredential,
	getAllUserCredentials,
	deleteUserCredential,
	updateUserCredentialEnabled,
	decryptCustomProvider,
	resolveApiKeyForCredential,
	resolveProviderKey,
	getDiscoveredModelsForUser,
	ensureUserCredentialsSchema,
	type UserCredentialState,
	type SaveUserCredentialInput,
	type ResolvedProviderKey
} from './credentials';

export {
	getVisibleModelIdsForUser,
	getExplicitlyHiddenModelIdsForUser,
	setModelVisibility,
	setAllModelVisibility,
	ensureVisibilitySchema
} from './visibility';

export { getAvailableModelsForUser, type AugmentedModelInfo } from './availability';

export { RateLimit, createRateLimitFetch, RATE_LIMIT_INLINE_THRESHOLD_MS } from './rate-limit';

export { encrypt, decrypt, maskKey } from './crypto';
