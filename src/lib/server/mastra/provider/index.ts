/**
 * Provider module — public barrel (server-only).
 *
 * Contract surface for callers outside this directory:
 * - resolver: `resolveModelForRequest`, `pickDefaultModelId`
 * - catalog:  built-in providers/models + lookup helpers
 * - credentials: per-user CRUD + helpers used by remote functions
 * - visibility: hidden-model selectors for the chat UI
 * - availability: `getAvailableModelsForUser` for the connect UI
 *
 * Internal infrastructure (rate-limit fetch, request cache, resolver
 * trace, discovery backoff, 4-tier router, schema bootstrap) lives in
 * `./internal` and is re-exported only for sibling modules in this
 * directory. Importing from `./internal` outside this directory is a
 * contract violation — open an issue instead.
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
} from '$lib/provider/catalog';

export {
	saveUserCredential,
	getUserCredential,
	getAllUserCredentials,
	getCustomCredentialBaseUrl,
	deleteUserCredential,
	updateUserCredentialEnabled,
	decryptCustomProvider,
	resolveApiKeyForCredential,
	rotateCredential,
	repairCorruptedCredential,
	PLATFORM_ENV_KEYS,
	type UserCredentialState,
	type UserCredentialKind,
	type SaveUserCredentialInput,
	type RotateCredentialInput,
	type RepairCorruptedCredentialInput
} from './credentials';

export {
	getHiddenModelIdsForUser,
	setModelVisibility,
	setAllModelVisibility
} from './visibility';

export { getAvailableModelsForUser, type AugmentedModelInfo } from './availability';
