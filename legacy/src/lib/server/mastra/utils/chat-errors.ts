/**
 * Error parsers for the chat workflow.
 *
 * Each parser converts a raw error (from `@ai-sdk/provider` or
 * `$lib/provider/errors`) into a `FriendlyError` shape the UI can
 * render in the chat error alert.
 */

import { APICallError, LoadAPIKeyError, InvalidPromptError, NoContentGeneratedError, NoSuchModelError } from '@ai-sdk/provider';
import {
	NoCredentialError,
	ProviderDisabledError,
	ModelNotFoundError,
	NoProvidersError
} from '$lib/provider/errors';

export interface FriendlyError {
	message: string;
	action?: { label: string; href: string };
	retryable: boolean;
	variant: 'info' | 'warning' | 'error';
}

export function parseApiCallError(err: APICallError): FriendlyError {
	const code = err.statusCode ?? 0;
	const upstream = (err.data as { error?: { message?: string } } | undefined)?.error?.message;
	if (code === 401 || code === 403) {
		return {
			message: `Authentication failed (HTTP ${code}). Check that the API key is valid and has access to the model.`,
			action: { label: 'Manage API keys', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (code === 404) {
		return {
			message: 'Model not found on provider (HTTP 404). The provider may have renamed or removed the model.',
			retryable: false,
			variant: 'error'
		};
	}
	if (code === 429) {
		return {
			message: 'Rate limit reached. Please wait a moment and try again.',
			retryable: true,
			variant: 'warning'
		};
	}
	if (code >= 500) {
		return {
			message: 'The AI service is currently unavailable. Please try again in a moment.',
			retryable: true,
			variant: 'warning'
		};
	}
	if (err.isRetryable) {
		return {
			message: upstream || 'A temporary error occurred. Please try again.',
			retryable: true,
			variant: 'warning'
		};
	}
	return {
		message: upstream || err.message || 'Request was rejected by the API.',
		retryable: false,
		variant: 'error'
	};
}

export function parseFallback(err: unknown): FriendlyError {
	const msg = err instanceof Error ? err.message : String(err);
	if (msg.includes('File not found') || msg.includes('No OCR metadata')) {
		return { message: 'Could not read the file content. The file may still be processing.', retryable: false, variant: 'error' };
	}
	if (msg.includes('missing field') || msg.includes('Failed to deserialize')) {
		return { message: 'A data formatting issue occurred. Please try again or start a new conversation.', retryable: true, variant: 'warning' };
	}
	if (msg.includes('AbortError') || msg.includes('aborted')) {
		return { message: 'Request cancelled.', retryable: false, variant: 'info' };
	}
	const truncated = msg.length > 200 ? msg.slice(0, 200) + '…' : msg;
	return { message: truncated, retryable: false, variant: 'error' };
}

export function parseFriendlyError(err: unknown): FriendlyError {
	if (err instanceof NoCredentialError) {
		return {
			message: `No API key is configured for "${err.providerId}". Connect this provider in Settings → Providers.`,
			action: { label: 'Open Settings', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (err instanceof ProviderDisabledError) {
		return {
			message: `The "${err.providerId}" provider is disabled. Re-enable it in Settings → Providers.`,
			action: { label: 'Open Settings', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (err instanceof ModelNotFoundError) {
		return {
			message: `Model "${err.modelId}" wasn't found on "${err.providerId}". Try a different model from the selector.`,
			retryable: false,
			variant: 'error'
		};
	}
	if (err instanceof NoProvidersError) {
		return {
			message: 'No providers configured. Add at least one provider in Settings → Providers.',
			action: { label: 'Open Settings', href: '/settings/providers' },
			retryable: false,
			variant: 'error'
		};
	}
	if (APICallError.isInstance(err)) {
		return parseApiCallError(err);
	}
	if (NoSuchModelError.isInstance(err)) {
		return {
			message: 'The selected model is not available. Try a different model from the selector.',
			retryable: false,
			variant: 'error'
		};
	}
	if (LoadAPIKeyError.isInstance(err)) {
		return {
			message: 'The platform default model has no API key configured. Contact your administrator.',
			retryable: false,
			variant: 'error'
		};
	}
	if (InvalidPromptError.isInstance(err)) {
		return {
			message: 'Your message could not be sent. Please try a different prompt.',
			retryable: false,
			variant: 'warning'
		};
	}
	if (NoContentGeneratedError.isInstance(err)) {
		return {
			message: 'The model did not generate a response. This is usually a temporary issue — try again.',
			retryable: true,
			variant: 'warning'
		};
	}
	return parseFallback(err);
}
