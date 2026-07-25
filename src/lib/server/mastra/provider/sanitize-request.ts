/**
 * Provider-agnostic request-body sanitizer.
 *
 * Walks the JSON request body that is about to be sent to an LLM provider and
 * ensures:
 *   1. Every `role: "tool"` message has a string `content` field — works
 *      around SDK bugs in unpatched `@ai-sdk/openai-compatible` providers
 *      (DeepSeek, Groq, OpenCode Zen, Kimchi) that leave `content` undefined
 *      when a tool result has an unhandled or empty output type.
 *   2. Every `role: "assistant"` message has a string `content` field —
 *      required by every OpenAI-compatible endpoint. Earlier the sanitizer
 *      only filled `content: ''` when the message carried `tool_calls`, but
 *      an assistant turn that produced only reasoning (no text, no tool
 *      calls) still ends up with `content: null` or no content at all.
 *      Kimchi (vLLM-based) rejects this with `messages[N]: missing field
 *      content`; DeepSeek, Groq, and OpenCode Zen also 400 on `content: null`.
 *      Force the field to a string unconditionally.
 *   3. Every `role: "assistant"` message that carries a
 *      `reasoning_content` or `reasoning` field has those fields
 *      stripped. Groq's OpenAI-compatible endpoint rejects
 *      `reasoning_content` as an unsupported property on assistant
 *      messages with a 400. The AI SDK emits the field for
 *      reasoning-capable models (DeepSeek-R1, Kimchi reasoning
 *      models, OpenCode Zen's `gpt-oss-120b`); the chat history
 *      persisted in Mastra memory keeps the field, but the next
 *      request must not forward it.
 *
 * Previously these workarounds lived in `patches/@ai-sdk__openai-compatible@2.0.47.patch`,
 * a pnpm patch that broke on every upstream SDK version bump. In-tree code
 * is version-stable.
 */

export function coerceToString(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	return JSON.stringify(value);
}

/**
 * Sanitize a provider chat-completion request body.
 *
 * - Returns the original body if it is not an object or has no `messages` array.
 * - Mutates tool messages where `content` is missing or not a string.
 * - Mutates assistant messages where `content` is not a string (replaces
 *   with `''`). Previously gated on `tool_calls`; now unconditional so
 *   reasoning-only turns (no text, no tool calls) don't get rejected by
 *   Kimchi/vLLM.
 * - Strips `reasoning_content` / `reasoning` from assistant messages so
 *   Groq and other strict providers don't 400 on the field.
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
	const messages = record.messages.map((message: unknown, idx: number) => {
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

		if (msg.role === 'assistant') {
			let next: Record<string, unknown> = msg;
			const hadReasoningContent = 'reasoning_content' in next;
			const hadReasoning = 'reasoning' in next;

			// Strip reasoning_content / reasoning — Groq rejects these
			// on assistant messages with a 400. The AI SDK persists the
			// field for reasoning-capable models; we hold the reasoning
			// for the client to render but never forward it to the
			// upstream. The fields are private chain-of-thought; the
			// model produced the assistant `content` without needing them
			// back as input.
			if (hadReasoningContent || hadReasoning) {
				const { reasoning_content: _rc, reasoning: _r, ...rest } = next;
				next = rest;
				changed = true;
				console.debug(
					`[sanitize] stripped reasoning from assistant msg[${idx}] hadReasoningContent=${hadReasoningContent} hadReasoning=${hadReasoning}`
				);
			}

			// Ensure every assistant message has a string `content` field.
			// Kimchi (vLLM-based) rejects messages with missing/empty content
			// with `messages[N]: missing field content`. Earlier the sanitizer
			// only filled `content: ''` when the message carried `tool_calls`,
			// but an assistant turn that produced only reasoning (no text, no
			// tool calls) still ends up with `content: null` or no content at
			// all. Force the field to a string unconditionally so the wire
			// format satisfies every OpenAI-compatible endpoint.
			if (typeof next.content !== 'string') {
				const previousContent = next.content;
				next = { ...next, content: '' };
				changed = true;
				console.debug(
					`[sanitize] coerced assistant msg[${idx}] content to '' (was ${previousContent === null ? 'null' : previousContent === undefined ? 'undefined' : Array.isArray(previousContent) ? 'array' : typeof previousContent})`
				);
			}

			return next;
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

	console.info(`[sanitize] rewrote body (${body.length}→${sanitizedJson.length} bytes)`);
	return { ...init, body: sanitizedJson };
}
