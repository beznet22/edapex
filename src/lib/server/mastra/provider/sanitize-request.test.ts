import { describe, it, expect } from 'vitest';
import {
	sanitizeProviderRequestBody,
	sanitizeRequestInit,
	coerceToString
} from './sanitize-request';

describe('sanitizeProviderRequestBody', () => {
	it('returns non-object bodies unchanged', () => {
		expect(sanitizeProviderRequestBody('hello')).toBe('hello');
		expect(sanitizeProviderRequestBody(42)).toBe(42);
		expect(sanitizeProviderRequestBody(null)).toBe(null);
		expect(sanitizeProviderRequestBody(undefined)).toBe(undefined);
		expect(sanitizeProviderRequestBody(['foo'])).toEqual(['foo']);
	});

	it('returns bodies without a messages array unchanged', () => {
		const body = { model: 'gpt-4', prompt: 'hello' };
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});

	it('coerces tool message content to string', () => {
		const body = {
			model: 'gpt-4',
			messages: [
				{ role: 'tool', content: undefined, tool_call_id: '1' },
				{ role: 'tool', content: null, tool_call_id: '2' },
				{ role: 'tool', content: { result: 1 }, tool_call_id: '3' },
				{ role: 'tool', content: 'already string', tool_call_id: '4' }
			]
		};

		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0].content).toBe('');
		expect(sanitized.messages[1].content).toBe('');
		expect(sanitized.messages[2].content).toBe('{"result":1}');
		expect(sanitized.messages[3].content).toBe('already string');
	});

	it('coerces assistant tool-call content to empty string', () => {
		const body = {
			messages: [
				{ role: 'assistant', content: null, tool_calls: [{ id: '1' }] },
				{ role: 'assistant', content: undefined, tool_calls: [{ id: '2' }] },
				{ role: 'assistant', content: 'text', tool_calls: [{ id: '3' }] }
			]
		};

		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0].content).toBe('');
		expect(sanitized.messages[1].content).toBe('');
		expect(sanitized.messages[2].content).toBe('text');
	});

	it('ignores assistant messages without tool_calls', () => {
		const body = { messages: [{ role: 'assistant', content: null }] };
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});

	it('ignores empty tool_calls array', () => {
		const body = { messages: [{ role: 'assistant', content: null, tool_calls: [] }] };
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});

	it('returns the same object when no changes are needed', () => {
		const body = { messages: [{ role: 'user', content: 'hi' }] };
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});

	it('passes through non-object messages', () => {
		const body: { messages: (string | null | { role: string; content: string })[] } = {
			messages: ['not an object', null, { role: 'user', content: 'hi' }]
		};
		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0]).toBe('not an object');
		expect(sanitized.messages[1]).toBe(null);
		const userMsg = sanitized.messages[2];
		if (typeof userMsg !== 'string' && userMsg !== null) {
			expect(userMsg.content).toBe('hi');
		}
	});

	describe('reasoning_content / reasoning strip (Groq compatibility)', () => {
		it("strips `reasoning_content` from an assistant message", () => {
			const body = {
				messages: [
					{
						role: 'assistant',
						content: 'final answer',
						reasoning_content: 'private chain of thought that Groq rejects'
					}
				]
			};
			const sanitized = sanitizeProviderRequestBody(body) as typeof body;
			expect(sanitized.messages[0]).not.toHaveProperty('reasoning_content');
			expect(sanitized.messages[0].content).toBe('final answer');
		});

		it("strips `reasoning` (alternate key) from an assistant message", () => {
			const body = {
				messages: [{ role: 'assistant', content: 'final', reasoning: 'private' }]
			};
			const sanitized = sanitizeProviderRequestBody(body) as typeof body;
			expect(sanitized.messages[0]).not.toHaveProperty('reasoning');
			expect(sanitized.messages[0].content).toBe('final');
		});

		it('strips both reasoning_content and reasoning when both are present', () => {
			const body = {
				messages: [
					{
						role: 'assistant',
						content: 'final',
						reasoning_content: 'rc',
						reasoning: 'r'
					}
				]
			};
			const sanitized = sanitizeProviderRequestBody(body) as typeof body;
			expect(sanitized.messages[0]).not.toHaveProperty('reasoning_content');
			expect(sanitized.messages[0]).not.toHaveProperty('reasoning');
		});

		it('strips reasoning_content even when tool_calls are present (and fills empty content)', () => {
			const body = {
				messages: [
					{
						role: 'assistant',
						content: null,
						reasoning_content: 'rc',
						tool_calls: [{ id: '1' }]
					}
				]
			};
			const sanitized = sanitizeProviderRequestBody(body) as typeof body;
			const msg = sanitized.messages[0];
			expect(msg).not.toHaveProperty('reasoning_content');
			expect(msg.content).toBe('');
			expect(msg.tool_calls).toEqual([{ id: '1' }]);
		});

		it('does not strip reasoning_content from non-assistant messages', () => {
			const body = {
				messages: [
					{ role: 'user', content: 'hi', reasoning_content: 'should be kept' }
				]
			};
			expect(sanitizeProviderRequestBody(body)).toBe(body);
		});

		it('is idempotent — sanitizing twice is a no-op', () => {
			const body = {
				messages: [
					{
						role: 'assistant',
						content: 'final',
						reasoning_content: 'rc'
					}
				]
			};
			const once = sanitizeProviderRequestBody(body) as typeof body;
			const twice = sanitizeProviderRequestBody(once) as typeof once;
			expect(twice).toBe(once);
		});

		it('preserves content, role, tool_calls, and other fields untouched', () => {
			const body = {
				messages: [
					{
						role: 'assistant',
						content: 'final',
						name: 'assistant',
						reasoning_content: 'rc',
						annotations: ['a', 'b'],
						tool_calls: [{ id: '1' }]
					}
				]
			};
			const sanitized = sanitizeProviderRequestBody(body) as typeof body;
			const msg = sanitized.messages[0];
			expect(msg.role).toBe('assistant');
			expect(msg.content).toBe('final');
			expect(msg.name).toBe('assistant');
			expect(msg.annotations).toEqual(['a', 'b']);
			expect(msg.tool_calls).toEqual([{ id: '1' }]);
			expect(msg).not.toHaveProperty('reasoning_content');
		});
	});
});

describe('sanitizeRequestInit', () => {
	it('returns undefined for undefined init', () => {
		expect(sanitizeRequestInit(undefined)).toBe(undefined);
	});

	it('returns non-POST init unchanged', () => {
		const init = { method: 'GET', body: '{}' };
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns non-string body init unchanged', () => {
		const init = { method: 'POST', body: new FormData() };
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns non-JSON content-type init unchanged', () => {
		const init = { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' };
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns invalid JSON body init unchanged', () => {
		const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'not json' };
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns init unchanged when sanitization makes no difference', () => {
		const body = JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] });
		const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body };
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('sanitizes JSON body when it changes', () => {
		const body = JSON.stringify({ messages: [{ role: 'tool', content: undefined, tool_call_id: '1' }] });
		const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body };
		const sanitized = sanitizeRequestInit(init);
		expect(sanitized).not.toBe(init);
		expect(JSON.parse(sanitized!.body as string).messages[0].content).toBe('');
	});

	it('reads headers from Headers instance', () => {
		const body = JSON.stringify({ messages: [{ role: 'assistant', content: null, tool_calls: [{ id: '1' }] }] });
		const init = {
			method: 'POST',
			headers: new Headers({ 'content-type': 'application/json' }),
			body
		};
		const sanitized = sanitizeRequestInit(init);
		expect(JSON.parse(sanitized!.body as string).messages[0].content).toBe('');
	});

	it('reads headers from array form', () => {
		const body = JSON.stringify({ messages: [{ role: 'assistant', content: null, tool_calls: [{ id: '1' }] }] });
		const init: RequestInit = {
			method: 'POST',
			headers: [['Content-Type', 'application/json']],
			body
		};
		const sanitized = sanitizeRequestInit(init);
		expect(JSON.parse(sanitized!.body as string).messages[0].content).toBe('');
	});
});

describe('coerceToString', () => {
	it('passes strings through', () => {
		expect(coerceToString('hello')).toBe('hello');
	});

	it('returns empty string for null and undefined', () => {
		expect(coerceToString(null)).toBe('');
		expect(coerceToString(undefined)).toBe('');
	});

	it('serializes objects and numbers', () => {
		expect(coerceToString(42)).toBe('42');
		expect(coerceToString({ a: 1 })).toBe('{"a":1}');
	});
});
