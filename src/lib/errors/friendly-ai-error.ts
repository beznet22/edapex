/**
 * Structured AI error categorisation — V2.
 *
 * Replaces the legacy `userMessageFor` / `settingsActionFor` pair in
 * `chat-context.svelte.ts` and the workflow's `parseFriendlyError`
 * with a tagged-discriminated union. The `kind` discriminator drives
 * the UI presentation (title + message + action button) without
 * re-parsing strings.
 *
 * Two layers:
 *   1. `categorizeAIError(error)` — pure data. Returns a
 *      `FriendlyAiError` with all the fields the UI needs. Idempotent.
 *   2. `describe(err)` — presentation. Returns `{ title, message, action }`
 *      for the rendering component.
 *
 * The categoriser is a safety net: errors that arrive via the
 * `data-error` stream part from the server are already categorized
 * server-side, so the client can pass them through. Errors that come
 * through the `useChat.error` channel (initial connection failures,
 * etc.) are re-categorized here.
 *
 * English strings only for now. A `messageKey` field on each variant
 * is reserved for the future i18n migration.
 */
import {
	APICallError,
	LoadAPIKeyError,
	NoSuchModelError,
	NoContentGeneratedError
} from '@ai-sdk/provider';
import { NoObjectGeneratedError, RetryError } from 'ai';
import {
	NoCredentialError,
	ProviderDisabledError,
	RateLimitError
} from '$lib/provider/errors';

export type FriendlyAction =
	| 'regenerate' // re-run the assistant turn via chat.regenerate()
	| 'clear_context' // drop the failed assistant message, ask user to start fresh
	| 'open_settings' // go to /settings/providers
	| 'contact_support'
	| 'none'
	| 'edit_marksheet_then_retry' // NEW
	| 'mention_student' // NEW
	| 'rerun_format' // NEW
	| 'rephrase_request'; // NEW

export type FriendlyAiError =
	| { kind: 'rate_limit'; providerId: string; retryAfterSeconds: number | null; resetAt: string | null }
	| { kind: 'context_overflow'; providerId: string; limit?: number }
	| { kind: 'auth'; providerId: string; status: 401 | 403 }
	| { kind: 'model_not_found'; providerId: string; modelId: string }
	| { kind: 'load_api_key'; providerId?: string }
	| { kind: 'no_credential'; providerId: string }
	| { kind: 'provider_disabled'; providerId: string }
	| { kind: 'no_content'; reason?: string }
	| { kind: 'truncated'; reason: 'length' }
	| { kind: 'aborted' }
	| { kind: 'service_unavailable'; status?: number }
	| { kind: 'invalid_prompt' }
	| { kind: 'retry_exhausted'; cause: string }
	| { kind: 'unknown'; cause: string }
	| { kind: 'auto_fix_exhausted'; title: string; message: string; action: 'edit_marksheet_then_retry' }
	| { kind: 'student_id_missing'; title: string; message: string; action: 'mention_student' }
	| { kind: 'persist_path_missing'; title: string; message: string; action: 'rerun_format' }
	| { kind: 'tool_not_registered'; title: string; message: string; action: 'contact_support' }
	| { kind: 'agent_loop_exhausted'; title: string; message: string; action: 'rephrase_request' }
	| { kind: 'bun_precondition_failed'; title: string; message: string; action: 'contact_support' };

export interface FriendlyPresentation {
	title: string;
	message: string;
	action: FriendlyAction;
}

const CONTEXT_LENGTH_PATTERNS =
	/context.length.exceeded|maximum.context.length|prompt.is.too.long|context_length_exceeded|request was too large/i;

function isContextLengthError(body: string | undefined): boolean {
	if (!body) return false;
	return CONTEXT_LENGTH_PATTERNS.test(body);
}

function inferProviderIdFromError(err: APICallError): string {
	try {
		const url = err.url ?? '';
		const match = url.match(/^https?:\/\/[^/]+\/([a-z0-9_-]+)/i);
		if (match) return match[1] ?? 'unknown';
	} catch {
		// ignore
	}
	return 'unknown';
}

function parseModelIdFromUrl(url: string | undefined): string {
	if (!url) return 'unknown';
	const parts = url.split('/');
	return parts[parts.length - 1] ?? 'unknown';
}

function parseRateLimitFromHeaders(
	providerId: string,
	headers: Record<string, string> | undefined
): { retryAfterSeconds: number | null; resetAt: string | null } {
	if (!headers) return { retryAfterSeconds: null, resetAt: null };
	const lc: Record<string, string> = {};
	for (const [k, v] of Object.entries(headers)) lc[k.toLowerCase()] = v;
	const retry = lc['retry-after'];
	const retryAfterSeconds = retry ? Number(retry) : null;
	const reset = lc['x-ratelimit-reset'] ?? lc['x-ratelimit-reset-requests'] ?? null;
	const resetAt = reset ? new Date(reset).toISOString() : null;
	return {
		retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
		resetAt
	};
}

export function categorizeAIError(error: unknown): FriendlyAiError {
	if (!error) {
		return { kind: 'unknown', cause: 'No error object' };
	}

	// EdApex-specific throws (server-side, before the AI SDK call)
	if (error instanceof RateLimitError) {
		return {
			kind: 'rate_limit',
			providerId: error.providerId,
			retryAfterSeconds: error.retryAfterSeconds,
			resetAt: error.resetAt
		};
	}
	if (error instanceof NoCredentialError) {
		return { kind: 'no_credential', providerId: error.providerId };
	}
	if (error instanceof ProviderDisabledError) {
		return { kind: 'provider_disabled', providerId: error.providerId };
	}

	// AI SDK native errors
	if (APICallError.isInstance(error)) {
		const status = error.statusCode;
		const providerId = inferProviderIdFromError(error);
		if (status === 429) {
			const { retryAfterSeconds, resetAt } = parseRateLimitFromHeaders(
				providerId,
				error.responseHeaders
			);
			return { kind: 'rate_limit', providerId, retryAfterSeconds, resetAt };
		}
		if (status === 401 || status === 403) {
			return { kind: 'auth', providerId, status: status as 401 | 403 };
		}
		if (status === 404) {
			return {
				kind: 'model_not_found',
				providerId,
				modelId: parseModelIdFromUrl(error.url)
			};
		}
		if (status === 400 && isContextLengthError(error.responseBody)) {
			return { kind: 'context_overflow', providerId };
		}
		if (status !== undefined && status >= 500) {
			return { kind: 'service_unavailable', status };
		}
		return { kind: 'unknown', cause: error.message };
	}

	if (NoSuchModelError.isInstance(error)) {
		return { kind: 'model_not_found', providerId: 'unknown', modelId: error.modelId };
	}
	if (LoadAPIKeyError.isInstance(error)) {
		return { kind: 'load_api_key' };
	}
	if (NoContentGeneratedError.isInstance(error)) {
		return { kind: 'no_content', reason: error.message };
	}
	if (NoObjectGeneratedError.isInstance(error)) {
		if (error.finishReason === 'length') {
			return { kind: 'truncated', reason: 'length' };
		}
		return { kind: 'no_content', reason: error.message };
	}
	if (RetryError.isInstance(error)) {
		return {
			kind: 'retry_exhausted',
			cause: error.lastError instanceof Error ? error.lastError.message : String(error.lastError ?? error.message)
		};
	}

	// Aborted by user (AbortController / signal.aborted)
	if (error instanceof Error) {
		if (error.name === 'AbortError' || /aborted/i.test(error.message)) {
			return { kind: 'aborted' };
		}

		// Agentic workflow errors (Chunk 5 / F6) — match by substring/case-insensitive.
		if (/auto.?fix.?exhausted|AUTO_FIX_EXHAUSTED/i.test(error.message)) {
			return {
				kind: 'auto_fix_exhausted',
				title: "Auto-fix couldn't resolve all issues",
				message:
					"We've auto-corrected what we could. Review the remaining marksheet errors and edit the document, then click Validate again.",
				action: 'edit_marksheet_then_retry'
			};
		}
		if (/student.?id.?missing|STUDENT_ID_MISSING/i.test(error.message)) {
			return {
				kind: 'student_id_missing',
				title: 'Which student is this marksheet for?',
				message:
					'Mention the student in the chat using @studentName, or link the marksheet to a student in the workspace.',
				action: 'mention_student'
			};
		}
		if (/persist.?path.?missing|PERSIST_PATH_MISSING/i.test(error.message)) {
			return {
				kind: 'persist_path_missing',
				title: "Marksheet hasn't been formatted yet",
				message:
					'The marksheet needs to be formatted before it can be validated. Try uploading it again or running /format.',
				action: 'rerun_format'
			};
		}
		if (/tool.?not.?registered|TOOL_NOT_REGISTERED/i.test(error.message)) {
			return {
				kind: 'tool_not_registered',
				title: 'Workflow configuration issue',
				message: "A required tool isn't registered with the workflow. Contact your administrator.",
				action: 'contact_support'
			};
		}
		if (/agent.?loop.?exhausted|AGENT_LOOP_EXHAUSTED|maxSteps/i.test(error.message)) {
			return {
				kind: 'agent_loop_exhausted',
				title: "Agent didn't reach a conclusion",
				message:
					"The agent tried several approaches but couldn't resolve this in the allowed number of steps. Try rephrasing your request or breaking it into smaller parts.",
				action: 'rephrase_request'
			};
		}
		if (/bun.?precondition|BUN_PRECONDITION_FAILED|server.?side.?depend/i.test(error.message)) {
			return {
				kind: 'bun_precondition_failed',
				title: 'Server setup incomplete',
				message: 'A server-side dependency is missing. Contact your administrator.',
				action: 'contact_support'
			};
		}

		return { kind: 'unknown', cause: error.message };
	}

	return { kind: 'unknown', cause: String(error) };
}

export function describe(err: FriendlyAiError): FriendlyPresentation {
	switch (err.kind) {
		case 'rate_limit':
			return {
				title: 'Provider speed limit reached',
				message: `Our AI engine is processing too many requests on "${err.providerId}". This is a temporary tier limit.`,
				action: 'regenerate'
			};
		case 'context_overflow':
			return {
				title: 'Conversation too long',
				message: `This chat thread has exceeded the AI model's structural memory limits. Start a fresh session to continue.`,
				action: 'clear_context'
			};
		case 'auth':
			return {
				title: 'Platform access denied',
				message: `The backend was blocked by the AI provider. This is likely an expired or invalid API key for "${err.providerId}".`,
				action: 'open_settings'
			};
		case 'model_not_found':
			return {
				title: 'Model not available',
				message: `Model "${err.modelId}" wasn't found on "${err.providerId}". Try a different model from the selector.`,
				action: 'none'
			};
		case 'load_api_key':
			return {
				title: 'API key missing',
				message: 'The platform default model has no API key configured. Contact your administrator.',
				action: 'contact_support'
			};
		case 'no_credential':
			return {
				title: 'Provider not connected',
				message: `No API key is configured for "${err.providerId}". Connect this provider to start chatting.`,
				action: 'open_settings'
			};
		case 'provider_disabled':
			return {
				title: 'Provider disabled',
				message: `The "${err.providerId}" provider is disabled. Re-enable it in Settings.`,
				action: 'open_settings'
			};
		case 'no_content':
			return {
				title: 'Empty response',
				message: err.reason
					? `The AI model produced no content. (${err.reason})`
					: 'The AI model produced no content. Please try again.',
				action: 'regenerate'
			};
		case 'truncated':
			return {
				title: 'Response truncated',
				message:
					"The AI's answer was cut off because it hit its generation token boundary. Try a fresh session or a model with a larger output limit.",
				action: 'clear_context'
			};
		case 'aborted':
			return {
				title: 'Request cancelled',
				message: 'The request was cancelled.',
				action: 'none'
			};
		case 'service_unavailable':
			return {
				title: 'AI service unavailable',
				message: err.status
					? `The AI service is currently unavailable (HTTP ${err.status}). Please try again in a moment.`
					: 'The AI service is currently unavailable. Please try again in a moment.',
				action: 'regenerate'
			};
		case 'invalid_prompt':
			return {
				title: 'Invalid prompt',
				message: 'Your message could not be sent. Please try a different prompt.',
				action: 'none'
			};
		case 'retry_exhausted':
			return {
				title: 'Retries exhausted',
				message: `The provider kept failing across all retry attempts. (${err.cause})`,
				action: 'regenerate'
			};
		case 'auto_fix_exhausted':
			return {
				title: "Auto-fix couldn't resolve all issues",
				message:
					"We've auto-corrected what we could. Review the remaining marksheet errors and edit the document, then click Validate again.",
				action: 'edit_marksheet_then_retry'
			};
		case 'student_id_missing':
			return {
				title: 'Which student is this marksheet for?',
				message:
					'Mention the student in the chat using @studentName, or link the marksheet to a student in the workspace.',
				action: 'mention_student'
			};
		case 'persist_path_missing':
			return {
				title: "Marksheet hasn't been formatted yet",
				message:
					'The marksheet needs to be formatted before it can be validated. Try uploading it again or running /format.',
				action: 'rerun_format'
			};
		case 'tool_not_registered':
			return {
				title: 'Workflow configuration issue',
				message: "A required tool isn't registered with the workflow. Contact your administrator.",
				action: 'contact_support'
			};
		case 'agent_loop_exhausted':
			return {
				title: "Agent didn't reach a conclusion",
				message:
					"The agent tried several approaches but couldn't resolve this in the allowed number of steps. Try rephrasing your request or breaking it into smaller parts.",
				action: 'rephrase_request'
			};
		case 'bun_precondition_failed':
			return {
				title: 'Server setup incomplete',
				message: 'A server-side dependency is missing. Contact your administrator.',
				action: 'contact_support'
			};
		case 'unknown':
		default:
			return {
				title: 'Something went wrong',
				message: err.cause || 'An unexpected error occurred while streaming data chunks.',
				action: 'regenerate'
			};
	}
}
