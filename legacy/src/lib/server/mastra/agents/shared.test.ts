import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildDefaultModelForRole, DEFAULT_MODEL } from './shared';

type ResolvedModelConfig = {
	id: string;
	url: string;
	apiKey: string;
	headers: Record<string, string>;
};

function roleConfig(role: Parameters<typeof buildDefaultModelForRole>[0]): ResolvedModelConfig {
	return buildDefaultModelForRole(role) as unknown as ResolvedModelConfig;
}

describe('buildDefaultModelForRole', () => {
	const originalEnv = { ...process.env };

	beforeEach(() => {
		// isolate from the real env so tests are deterministic
		process.env = { ...originalEnv };
		delete process.env.GROQ_API_KEY;
		delete process.env.GROQ_BASE_URL;
	});

	afterEach(() => {
		process.env = originalEnv;
	});

	describe('canonical URL property', () => {
		it('always returns https://api.groq.com/openai/v1 for every role', () => {
			for (const role of ['title', 'artifact', 'copilot', 'editor', 'formatter'] as const) {
				const cfg = roleConfig(role);
				expect(cfg.url).toBe('https://api.groq.com/openai/v1');
			}
		});

		it('ignores GROQ_BASE_URL — the catalog URL is the only source', () => {
			process.env.GROQ_BASE_URL = 'https://attacker.example/v1';
			const cfg = roleConfig('title');
			expect(cfg.url).toBe('https://api.groq.com/openai/v1');
		});
	});

	describe('per-call apiKey resolution', () => {
		it('returns empty apiKey when GROQ_API_KEY is unset', () => {
			const cfg = roleConfig('title');
			expect(cfg.apiKey).toBe('');
		});

		it('returns the current env.GROQ_API_KEY value (not a module-load capture)', () => {
			process.env.GROQ_API_KEY = 'gsk-call-time-1234567890';
			const cfg = roleConfig('title');
			expect(cfg.apiKey).toBe('gsk-call-time-1234567890');
		});

		it('reads GROQ_API_KEY on every call — not cached', () => {
			process.env.GROQ_API_KEY = 'gsk-first';
			const a = roleConfig('title');
			process.env.GROQ_API_KEY = 'gsk-second';
			const b = roleConfig('title');
			expect(a.apiKey).toBe('gsk-first');
			expect(b.apiKey).toBe('gsk-second');
			expect(a).not.toBe(b);
		});
	});

	describe('id shape', () => {
		it('uses <providerId>/<modelName> as the config id', () => {
			const cfg = roleConfig('title');
			expect(cfg.id).toBe('groq/llama-3.1-8b-instant');
		});

		it('produces a fresh object per call (no shared reference)', () => {
			const a = roleConfig('title');
			const b = roleConfig('title');
			expect(a).not.toBe(b);
		});
	});

	describe('headers', () => {
		it('sets Accept-Encoding: identity for Kimchi-style streaming', () => {
			const cfg = roleConfig('title');
			expect(cfg.headers).toEqual({ 'Accept-Encoding': 'identity' });
		});
	});

	describe('explicit env parameter overrides process.env', () => {
		it('uses the passed-in env object when provided', () => {
			const cfg = buildDefaultModelForRole('title', { GROQ_API_KEY: 'gsk-explicit' }) as unknown as ResolvedModelConfig;
			expect(cfg.apiKey).toBe('gsk-explicit');
		});

		it('falls back to process.env when the passed-in env is missing the key', () => {
			// set after beforeEach so the value is in process.env when the
			// function is called
			process.env.GROQ_API_KEY = 'gsk-from-process';
			const cfg = buildDefaultModelForRole('title', {}) as unknown as ResolvedModelConfig;
			expect(cfg.apiKey).toBe('gsk-from-process');
		});
	});
});

const defaultModel = DEFAULT_MODEL as unknown as ResolvedModelConfig;

describe('DEFAULT_MODEL (OpenCode fallback)', () => {
	const originalOpenCodeKey = process.env.OPENCODE_API_KEY;

	beforeEach(() => {
		// DEFAULT_MODEL is captured at module load, so we cannot mutate
		// the env after import. We just verify the SHAPE and URL.
	});

	afterEach(() => {
		if (originalOpenCodeKey === undefined) {
			delete process.env.OPENCODE_API_KEY;
		} else {
			process.env.OPENCODE_API_KEY = originalOpenCodeKey;
		}
	});

	it('uses the canonical OpenCode Zen URL', () => {
		expect(defaultModel.url).toBe('https://opencode.ai/zen/v1');
	});

	it('exposes an id in the <providerId>/<modelName> shape', () => {
		expect(defaultModel.id).toBe('opencode/deepseek-v4-flash');
	});

	it('exposes an apiKey string (empty when OPENCODE_API_KEY is unset)', () => {
		expect(typeof defaultModel.apiKey).toBe('string');
	});

	it('sets Accept-Encoding: identity for Kimchi-style streaming compatibility', () => {
		expect(defaultModel.headers).toEqual({ 'Accept-Encoding': 'identity' });
	});
});
