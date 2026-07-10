/**
 * Tagged error classes for the provider system (client-safe).
 *
 * Pure error classes — no Node-only APIs. Safe to import in client and server.
 * Compatible with the Opencode Schema.TaggedErrorClass pattern.
 */
import type { ProviderId, ModelId, VariantId } from './types';

export abstract class ProviderError extends Error {
	abstract readonly _tag: string;
	constructor(message: string) {
		super(message);
		this.name = this.constructor.name;
	}
}

export class ModelNotFoundError extends ProviderError {
	readonly _tag = 'ModelNotFoundError';
	constructor(
		public readonly providerId: ProviderId,
		public readonly modelId: ModelId,
		public readonly suggestions: string[] = []
	) {
		super(`Model not found: ${providerId}/${modelId}`);
	}
}

export class ProviderNotFoundError extends ProviderError {
	readonly _tag = 'ProviderNotFoundError';
	constructor(public readonly providerId: ProviderId) {
		super(`Provider not found: ${providerId}`);
	}
}

export class NoProvidersError extends ProviderError {
	readonly _tag = 'NoProvidersError';
	constructor() {
		super('No providers available. Connect at least one provider in Settings → Providers.');
	}
}

export class NoModelsError extends ProviderError {
	readonly _tag = 'NoModelsError';
	constructor(public readonly providerId: ProviderId) {
		super(`No models available for provider "${providerId}"`);
	}
}

export class UnsupportedApiError extends ProviderError {
	readonly _tag = 'UnsupportedApiError';
	constructor(
		public readonly providerId: ProviderId,
		public readonly modelId: ModelId,
		public readonly api: string
	) {
		super(`Unsupported API "${api}" for ${providerId}/${modelId}`);
	}
}

export class NoCredentialError extends ProviderError {
	readonly _tag = 'NoCredentialError';
	constructor(public readonly providerId: ProviderId) {
		super(`No credential found for provider "${providerId}"`);
	}
}

export class RateLimitError extends ProviderError {
	readonly _tag = 'RateLimitError';
	constructor(
		public readonly providerId: ProviderId,
		public readonly retryAfterSeconds: number | null,
		public readonly resetAt: string | null
	) {
		super(
			retryAfterSeconds
				? `Rate limit on "${providerId}". Retry in ${retryAfterSeconds}s.`
				: `Rate limit on "${providerId}". Please try again shortly.`
		);
	}
}

export class ProviderDisabledError extends ProviderError {
	readonly _tag = 'ProviderDisabledError';
	constructor(public readonly providerId: ProviderId) {
		super(`Provider "${providerId}" is disabled`);
	}
}

/**
 * Thrown when decrypting an encrypted credential blob fails. Covers
 * malformed ciphertext (missing IV separator, invalid hex), wrong-key
 * decryption (auth tag / padding mismatch from AES-CBC), and any
 * other Node crypto failure during decipher.final().
 *
 * Callers MUST treat this as a hard failure — a returning empty string
 * would silently authorize requests with no key at all.
 */
export class DecryptionError extends ProviderError {
	readonly _tag = 'DecryptionError';
	constructor(
		message: string,
		public readonly providerHint?: string,
		public override readonly cause?: unknown
	) {
		super(message);
	}
}
