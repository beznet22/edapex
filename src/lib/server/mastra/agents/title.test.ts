/**
 * Tests for the title agent's per-request model callback.
 *
 * Locks the precedence:
 *   1. `requestContext.modelConfig` (V2: a pre-resolved MastraModelConfig)
 *   2. `requestContext.modelId` (V1: a string the native router resolves)
 *   3. `buildDefaultModelForRole('title')` — per-call Groq config from
 *      `env.GROQ_API_KEY` and `BUILTIN_PROVIDERS.groq.api.url`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RequestContext } from '@mastra/core/request-context';
import type { OpenAICompatibleConfig } from '@mastra/core/llm';
import { buildDefaultModelForRole } from './shared';
import { titleAgent } from './title';

type ModelCallback = (ctx: { requestContext?: RequestContext<unknown> }) => OpenAICompatibleConfig | string;

const modelField = titleAgent.model as unknown as ModelCallback;

function getModel(requestContext?: RequestContext<unknown>): OpenAICompatibleConfig | string {
	return modelField({ requestContext });
}

describe('title agent model callback', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		process.env = { ...originalEnv };
		delete process.env.GROQ_API_KEY;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('V2 path — requestContext.modelConfig', () => {
		it('returns the V2 config when present (no env involvement)', () => {
			const v2Config: OpenAICompatibleConfig = {
				id: 'groq/custom-model',
				url: 'https://api.groq.com/openai/v1',
				apiKey: 'gsk-from-v2-config',
				headers: {}
			};
			const requestContext = new RequestContext();
			requestContext.set('modelConfig', v2Config);

			const result = getModel(requestContext);
			expect(result).toBe(v2Config);
		});
	});

	describe('V1 path — requestContext.modelId', () => {
		it('returns the V1 modelId string when no V2 config is present', () => {
			const requestContext = new RequestContext();
			requestContext.set('modelId', 'groq/llama-3.3-70b-versatile');
			expect(getModel(requestContext)).toBe('groq/llama-3.3-70b-versatile');
		});

		it('prefers V2 over V1 when both are present', () => {
			const v2Config: OpenAICompatibleConfig = {
				id: 'groq/v2-wins',
				url: 'https://api.groq.com/openai/v1',
				apiKey: 'gsk-v2',
				headers: {}
			};
			const requestContext = new RequestContext();
			requestContext.set('modelConfig', v2Config);
			requestContext.set('modelId', 'groq/v1-loser');
			expect(getModel(requestContext)).toBe(v2Config);
		});
	});

	describe('fallback path — buildDefaultModelForRole', () => {
		it('uses buildDefaultModelForRole when no requestContext is supplied', () => {
			process.env.GROQ_API_KEY = 'gsk-fallback';
			const expected = buildDefaultModelForRole('title');
			const result = getModel(undefined);
			expect(result).toEqual(expected);
		});

		it('uses buildDefaultModelForRole when requestContext is empty', () => {
			process.env.GROQ_API_KEY = 'gsk-fallback';
			const requestContext = new RequestContext();
			const expected = buildDefaultModelForRole('title');
			const result = getModel(requestContext);
			expect(result).toEqual(expected);
		});

		it('the fallback URL is always https://api.groq.com/openai/v1 (catalog-only)', () => {
			process.env.GROQ_BASE_URL = 'https://attacker.example/v1';
			const result = getModel(undefined);
			const cfg = result as OpenAICompatibleConfig;
			expect(cfg.url).toBe('https://api.groq.com/openai/v1');
		});

		it('the fallback apiKey reflects the current env.GROQ_API_KEY (not module-load capture)', () => {
			process.env.GROQ_API_KEY = 'gsk-aaa';
			const first = getModel(undefined) as OpenAICompatibleConfig;
			process.env.GROQ_API_KEY = 'gsk-bbb';
			const second = getModel(undefined) as OpenAICompatibleConfig;
			expect(first.apiKey).toBe('gsk-aaa');
			expect(second.apiKey).toBe('gsk-bbb');
		});
	});
});
