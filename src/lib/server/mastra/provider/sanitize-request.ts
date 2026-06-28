/**
 * Provider-agnostic request-body sanitizer.
 *
 * Walks the JSON request body that is about to be sent to an LLM provider and
 * ensures:
 *   1. Every `role: "tool"` message has a string `content` field — works
 *      around SDK bugs in unpatched `@ai-sdk/openai-compatible` providers
 *      (DeepSeek, Groq, OpenCode Zen, Kimchi) that leave `content` undefined
 *      when a tool result has an unhandled or empty output type.
 *   2. Every `role: "assistant"` message that carries `tool_calls` has a
 *      string `content` field — works around the upstream SDK emitting
 *      `content: null` when the assistant turn is purely tool calls with
 *      no preceding text. Some providers (notably DeepSeek) reject the
 *      request with a 400 on `content: null`.
 *
 * Previously these workarounds lived in `patches/@ai-sdk__openai-compatible@2.0.47.patch`,
 * a pnpm patch that broke on every upstream SDK version bump. In-tree code
 * is version-stable.
 */

function coerceToString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	return JSON.stringify(value);
}

/**
 * Sanitize a provider chat-completion request body.
 *
 * - Returns the original body if it is not an object or has no `messages` array.
 * - Mutates tool messages where `content` is missing or not a string.
 * - Mutates assistant messages carrying `tool_calls` where `content` is
 *   null/missing (replaces with `''`).
 */
export function sanitizeProviderRequestBody(body: unknown): unknown {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return body;
	}

	const record = body as Record<string, unknown>;
	if (!Array.isArray(record.messages)) {
		return body;
	}

	let changed = false;
	const messages = record.messages.map((message: unknown) => {
		if (typeof message !== 'object' || message === null) {
			return message;
		}

		const msg = message as Record<string, unknown>;

		if (msg.role === 'tool') {
			const coerced = coerceToString(msg.content);
			if (coerced === msg.content) {
				return message;
			}
			changed = true;
			return { ...msg, content: coerced };
		}

		if (
			msg.role === 'assistant' &&
			Array.isArray(msg.tool_calls) &&
			msg.tool_calls.length > 0 &&
			typeof msg.content !== 'string'
		) {
			changed = true;
			return { ...msg, content: '' };
		}

		return message;
	});

	if (!changed) {
		return body;
	}

	return { ...record, messages };
}

function getHeader(headers: HeadersInit | undefined, name: string): string | undefined {
	if (headers == null) return undefined;

	const lowerName = name.toLowerCase();

	if (headers instanceof Headers) {
		return headers.get(name) ?? undefined;
	}

	if (Array.isArray(headers)) {
		const found = headers.find(([key]) => key.toLowerCase() === lowerName);
		return found?.[1];
	}

	const record = headers as Record<string, unknown>;
	for (const [key, value] of Object.entries(record)) {
		if (key.toLowerCase() === lowerName && typeof value === 'string') {
			return value;
		}
	}

	return undefined;
}

function isJsonRequest(init: RequestInit | undefined): boolean {
	if (!init) return false;
	if (init.method && init.method.toUpperCase() !== 'POST') return false;
	if (typeof init.body !== 'string') return false;

	const contentType = getHeader(init.headers, 'content-type');
	return contentType != null && contentType.includes('application/json');
}

/**
 * Return a `RequestInit` whose body has been sanitized, or the original init
 * if sanitization is not applicable or not needed.
 */
export function sanitizeRequestInit(init: RequestInit | undefined): RequestInit | undefined {
	if (!isJsonRequest(init)) {
		return init;
	}

	const { body } = init as { body: string };
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return init;
	}

	const sanitized = sanitizeProviderRequestBody(parsed);
	const sanitizedJson = JSON.stringify(sanitized);
	if (sanitizedJson === body) {
		return init;
	}

	return { ...init, body: sanitizedJson };
}
