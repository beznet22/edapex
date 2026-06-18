import { describe, it, expect } from 'vitest';
import {
	sanitizeProviderRequestBody,
	sanitizeRequestInit
} from '$lib/server/mastra/provider/sanitize-request';

describe('sanitizeProviderRequestBody', () => {
	it('returns non-object bodies unchanged', () => {
		expect(sanitizeProviderRequestBody(null)).toBe(null);
		expect(sanitizeProviderRequestBody(undefined)).toBe(undefined);
		expect(sanitizeProviderRequestBody('string')).toBe('string');
		expect(sanitizeProviderRequestBody(42)).toBe(42);
		expect(sanitizeProviderRequestBody(['messages'])).toEqual(['messages']);
	});

	it('returns bodies without a messages array unchanged', () => {
		const body = { model: 'gpt-4', prompt: 'hello' };
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});

	it('leaves valid tool messages untouched', () => {
		const body = {
			model: 'deepseek/deepseek-chat',
			messages: [
				{ role: 'user', content: 'hi' },
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: 'Tool result text'
				}
			]
		};
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});

	it('coerces undefined tool content to an empty string', () => {
		const body = {
			messages: [
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: undefined
				}
			]
		};
		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0].content).toBe('');
	});

	it('coerces null tool content to an empty string', () => {
		const body = {
			messages: [
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: null
				}
			]
		};
		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0].content).toBe('');
	});

	it('coerces object tool content to a JSON string', () => {
		const body = {
			messages: [
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: { status: 'ok', count: 3 }
				}
			]
		};
		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0].content).toBe('{"status":"ok","count":3}');
	});

	it('coerces array tool content to a JSON string', () => {
		const body = {
			messages: [
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: [{ type: 'text', text: 'part' }]
				}
			]
		};
		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0].content).toBe('[{"type":"text","text":"part"}]');
	});

	it('only mutates tool messages', () => {
		const userMessage = { role: 'user', content: 'hello' };
		const assistantMessage = { role: 'assistant', content: 'hi' };
		const body = {
			messages: [
				userMessage,
				assistantMessage,
				{
					role: 'tool',
					tool_call_id: 'call_1',
					content: undefined
				}
			]
		};
		const sanitized = sanitizeProviderRequestBody(body) as typeof body;
		expect(sanitized.messages[0]).toBe(userMessage);
		expect(sanitized.messages[1]).toBe(assistantMessage);
		expect(sanitized.messages[2].content).toBe('');
	});

	it('returns the same object when no changes are needed', () => {
		const body = {
			messages: [
				{ role: 'user', content: 'hello' },
				{ role: 'tool', tool_call_id: 'call_1', content: 'ok' }
			]
		};
		expect(sanitizeProviderRequestBody(body)).toBe(body);
	});
});

describe('sanitizeRequestInit', () => {
	it('returns undefined when given undefined', () => {
		expect(sanitizeRequestInit(undefined)).toBe(undefined);
	});

	it('returns non-JSON requests unchanged', () => {
		const init = {
			method: 'GET',
			headers: { 'content-type': 'application/json' },
			body: '{"messages":[]}'
		};
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns non-string bodies unchanged', () => {
		const init = {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: new Uint8Array([1, 2, 3])
		};
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns non-JSON content-type requests unchanged', () => {
		const init = {
			method: 'POST',
			headers: { 'content-type': 'text/plain' },
			body: '{"messages":[]}'
		};
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('returns valid JSON bodies unchanged', () => {
		const init = {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"messages":[{"role":"tool","tool_call_id":"call_1","content":"ok"}]}'
		};
		expect(sanitizeRequestInit(init)).toBe(init);
	});

	it('sanitizes a POST JSON body with missing tool content', () => {
		const init = {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"messages":[{"role":"tool","tool_call_id":"call_1"}]}'
		};
		const sanitized = sanitizeRequestInit(init);
		expect(sanitized).not.toBe(init);
		expect(JSON.parse(sanitized!.body as string)).toEqual({
			messages: [{ role: 'tool', tool_call_id: 'call_1', content: '' }]
		});
	});

	it('handles Headers object', () => {
		const init = {
			method: 'POST',
			headers: new Headers({ 'content-type': 'application/json' }),
			body: '{"messages":[{"role":"tool","tool_call_id":"call_1","content":null}]}'
		};
		const sanitized = sanitizeRequestInit(init);
		expect(JSON.parse(sanitized!.body as string)).toEqual({
			messages: [{ role: 'tool', tool_call_id: 'call_1', content: '' }]
		});
	});

	it('handles array headers', () => {
		const init = {
			method: 'POST',
			headers: [['Content-Type', 'application/json']] as [string, string][],
			body: '{"messages":[{"role":"tool","tool_call_id":"call_1","content":null}]}'
		};
		const sanitized = sanitizeRequestInit(init);
		expect(JSON.parse(sanitized!.body as string)).toEqual({
			messages: [{ role: 'tool', tool_call_id: 'call_1', content: '' }]
		});
	});

	it('ignores malformed JSON bodies', () => {
		const init = {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{not json'
		};
		expect(sanitizeRequestInit(init)).toBe(init);
	});
});
