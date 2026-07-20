/**
 * Pre-save key verification.
 *
 * Before a user credential is written to the database, we call the
 * provider's `/models` endpoint with the candidate key. The result of
 * that single call decides whether the save proceeds:
 *
 *   - HTTP 2xx  → `ok: true`. The parsed model list is returned so the
 *                 caller can reuse it for `discovered_models` (saves a
 *                 second network round-trip).
 *   - HTTP 4xx  → `ok: false, recoverable: false`. The save MUST NOT
 *                 proceed. The key is invalid, forbidden, or otherwise
 *                 rejected by the upstream — the user must fix it.
 *   - HTTP 429  → `ok: false, recoverable: true`. Save proceeds with a
 *                 warning; the upstream is rate-limiting us.
 *   - HTTP 5xx / network throw / AbortError → `ok: false, recoverable: true`.
 *                 Save proceeds with a warning. The upstream may be
 *                 temporarily down or our connection is flaky; we do not
 *                 want to block the user from saving a key they know is
 *                 valid just because the upstream is having a bad day.
 *
 * The HTTP-4xx gate is the safety floor: a key that returns 401/403 is
 * never written. 2xx with an empty `data[]` is a valid key (some
 * providers legitimately return no models).
 */
import { z } from 'zod';
import type { ModelInfo } from '$lib/provider/spec';
import type { ProviderId } from './types';
import { ModelInfoSchema } from '$lib/provider/spec';

export const VERIFY_TIMEOUT_MS = 10_000;

export type VerifyFailureReason =
	| 'auth_failed'
	| 'forbidden'
	| 'bad_request'
	| 'not_found'
	| 'rate_limited'
	| 'upstream_error'
	| 'network_error'
	| 'invalid_response';

export type VerifyResult =
	| { ok: true; models: ModelInfo[]; status: number }
	| {
			ok: false;
			reason: VerifyFailureReason;
			message: string;
			recoverable: boolean;
			status?: number;
	  };

const RawModelSchema = z.object({
	id: z.string().min(1),
	name: z.string().optional(),
	description: z.string().optional(),
	context_length: z.number().optional(),
	supported_parameters: z.array(z.string()).optional(),
	capabilities: z
		.object({ function_calling: z.boolean().optional() })
		.optional(),
	architecture: z
		.object({
			input_modalities: z.array(z.string()).optional(),
			output_modalities: z.array(z.string()).optional()
		})
		.optional(),
	top_provider: z
		.object({ max_completion_tokens: z.number().optional() })
		.optional(),
	pricing: z
		.object({
			prompt: z.string().optional(),
			completion: z.string().optional()
		})
		.optional()
});

function mapModality(modality: string): string {
	const lower = modality.toLowerCase();
	switch (lower) {
		case 'text':
			return 'text/*';
		case 'image':
			return 'image/*';
		case 'file':
			return 'application/*';
		case 'audio':
			return 'audio/*';
		case 'video':
			return 'video/*';
		default:
			return modality;
	}
}

function mapModalities(modalities: ReadonlyArray<string> | undefined): string[] {
	if (!modalities || modalities.length === 0) return [];
	return modalities.map(mapModality);
}

function safeParsePricing(
	raw: z.infer<typeof RawModelSchema>['pricing']
): ModelInfo['cost'] | undefined {
	if (!raw) return undefined;
	if (raw.prompt === '0') {
		return { input: 0, output: 0, cache: { read: 0, write: 0 } };
	}
	const input = Number.parseFloat(raw.prompt ?? '0');
	const output = Number.parseFloat(raw.completion ?? '0');
	return {
		input: Number.isFinite(input) ? input : 0,
		output: Number.isFinite(output) ? output : 0,
		cache: { read: 0, write: 0 }
	};
}

function buildModelInfo(
	raw: z.infer<typeof RawModelSchema>,
	providerId: ProviderId
): ModelInfo | null {
	if (!raw.id) return null;
	const inputModalities = raw.architecture?.input_modalities ?? [];
	const outputModalities = raw.architecture?.output_modalities ?? [];
	const supportedParams = raw.supported_parameters ?? [];
	const tools =
		supportedParams.includes('tools') || raw.capabilities?.function_calling === true;
	const reasoning =
		supportedParams.includes('reasoning') || supportedParams.includes('reasoning_effort');
	const vision = inputModalities.includes('image') || inputModalities.includes('file');

	const candidate = {
		id: `${providerId}/${raw.id}`,
		providerId,
		name: raw.name ?? raw.id,
		capabilities: {
			tools,
			input: mapModalities(inputModalities),
			output: mapModalities(outputModalities),
			reasoning,
			vision
		},
		request: { headers: {}, body: {}, generation: {}, options: {} },
		variants: [],
		status: 'active' as const,
		enabled: true,
		limit: {
			context: raw.context_length ?? 8192,
			output: raw.top_provider?.max_completion_tokens ?? 4096
		},
		tier: 'mid' as const,
		cost: safeParsePricing(raw.pricing),
		description: raw.description ?? ''
	};

	const parsed = ModelInfoSchema.safeParse(candidate);
	return parsed.success ? parsed.data : null;
}

function extractModelsFromResponse(json: unknown, providerId: ProviderId): ModelInfo[] {
	if (!json || typeof json !== 'object') return [];
	const candidate = json as { data?: unknown };
	if (!Array.isArray(candidate.data)) return [];
	const out: ModelInfo[] = [];
	for (const item of candidate.data) {
		const result = RawModelSchema.safeParse(item);
		if (!result.success) continue;
		const built = buildModelInfo(result.data, providerId);
		if (!built) continue;
		if (built.id.startsWith('~')) continue;
		out.push(built);
	}
	return out;
}

export interface VerifyApiKeyArgs {
	providerId: ProviderId;
	baseUrl: string;
	apiKey: string | undefined;
	/** Override the global `fetch` for tests. */
	fetchImpl?: typeof fetch;
	/** Override the per-call timeout. */
	timeoutMs?: number;
}

function reasonForStatus(status: number): VerifyFailureReason {
	if (status === 401) return 'auth_failed';
	if (status === 403) return 'forbidden';
	if (status === 404) return 'not_found';
	if (status === 429) return 'rate_limited';
	if (status === 400 || status === 422) return 'bad_request';
	return 'upstream_error';
}

function recoverableForStatus(status: number): boolean {
	return status === 429 || status >= 500;
}

function userMessageFor(reason: VerifyFailureReason, status?: number): string {
	switch (reason) {
		case 'auth_failed':
			return 'Invalid API key. Please check your key and try again.';
		case 'forbidden':
			return 'This key does not have access to the /models endpoint. Verify the key permissions.';
		case 'not_found':
			return 'The /models endpoint was not found. Check the base URL.';
		case 'bad_request':
			return 'The upstream rejected the request. The key may be malformed.';
		case 'rate_limited':
			return 'The upstream is rate-limiting requests. The key is saved but models may be discovered later.';
		case 'upstream_error':
			return status
				? `The upstream returned ${status}. The key is saved but models may be discovered later.`
				: 'The upstream is unreachable. The key is saved but models may be discovered later.';
		case 'network_error':
			return 'Could not reach the upstream. The key is saved but models may be discovered later.';
		case 'invalid_response':
			return 'The upstream returned an unexpected response shape. The key is saved but model discovery is delayed.';
	}
}

export async function verifyApiKey(args: VerifyApiKeyArgs): Promise<VerifyResult> {
	const { providerId, baseUrl, apiKey, fetchImpl, timeoutMs } = args;
	const doFetch = fetchImpl ?? fetch;
	const timeout = timeoutMs ?? VERIFY_TIMEOUT_MS;

	const normalizedBase = baseUrl.replace(/\/+$/, '');
	const target = `${normalizedBase}/models`;

	const headers: Record<string, string> = { Accept: 'application/json' };
	if (apiKey && apiKey.length > 0) {
		headers.Authorization = `Bearer ${apiKey}`;
	}

	let response: Response;
	try {
		response = await doFetch(target, {
			method: 'GET',
			headers,
			signal: AbortSignal.timeout(timeout)
		});
	} catch (err) {
		const name = err instanceof Error ? err.name : '';
		const isAbort = name === 'TimeoutError' || name === 'AbortError';
		const reason: VerifyFailureReason = isAbort ? 'upstream_error' : 'network_error';
		return {
			ok: false,
			reason,
			message: userMessageFor(reason),
			recoverable: true
		};
	}

	if (!response.ok) {
		const reason = reasonForStatus(response.status);
		const recoverable = recoverableForStatus(response.status);
		return {
			ok: false,
			reason,
			message: userMessageFor(reason, response.status),
			recoverable,
			status: response.status
		};
	}

	let json: unknown;
	try {
		json = await response.json();
	} catch {
		return {
			ok: false,
			reason: 'invalid_response',
			message: userMessageFor('invalid_response'),
			recoverable: true,
			status: response.status
		};
	}

	const models = extractModelsFromResponse(json, providerId);
	return { ok: true, models, status: response.status };
}

/**
 * Error class for the hard (4xx) verification failure. The remote command
 * catches this and returns `{ success: false, message }` so the UI can
 * surface the inline error without the key being persisted.
 */
export class VerificationError extends Error {
	readonly reason: VerifyFailureReason;
	readonly status: number | undefined;
	constructor(reason: VerifyFailureReason, message: string, status?: number) {
		super(message);
		this.name = 'VerificationError';
		this.reason = reason;
		this.status = status;
	}
}
