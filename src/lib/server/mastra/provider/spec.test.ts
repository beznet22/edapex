import { describe, it, expect } from 'vitest';
import {
	AISDKApiSchema,
	NativeApiSchema,
	ProviderEnabledSchema,
	ProviderInfoSchema,
	ProviderRequestSchema,
	CapabilitiesSchema,
	LimitSchema,
	ModelInfoSchema,
	VariantSchema,
	CostSchema
} from './spec';

describe('API schemas', () => {
	it('accepts aisdk api', () => {
		const result = AISDKApiSchema.safeParse({ type: 'aisdk', package: '@ai-sdk/openai' });
		expect(result.success).toBe(true);
	});

	it('accepts native api', () => {
		const result = NativeApiSchema.safeParse({ type: 'native', settings: {} });
		expect(result.success).toBe(true);
	});

	it('rejects native api without settings', () => {
		const result = NativeApiSchema.safeParse({ type: 'native' });
		expect(result.success).toBe(false);
	});
});

describe('ProviderEnabledSchema', () => {
	it('accepts false', () => {
		expect(ProviderEnabledSchema.safeParse(false).success).toBe(true);
	});

	it('accepts env override', () => {
		expect(ProviderEnabledSchema.safeParse({ via: 'env', name: 'FOO_API_KEY' }).success).toBe(true);
	});

	it('accepts credential override', () => {
		expect(
			ProviderEnabledSchema.safeParse({ via: 'credential', credentialId: 'cred-1' }).success
		).toBe(true);
	});

	it('accepts custom override', () => {
		expect(ProviderEnabledSchema.safeParse({ via: 'custom', data: {} }).success).toBe(true);
	});
});

describe('ProviderInfoSchema', () => {
	it('fills defaults and accepts minimal valid provider', () => {
		const result = ProviderInfoSchema.safeParse({
			id: 'groq',
			name: 'Groq',
			enabled: { via: 'env', name: 'GROQ_API_KEY' },
			env: ['GROQ_API_KEY'],
			api: { type: 'aisdk', package: '@ai-sdk/groq' }
		});
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.request.headers).toEqual({});
		expect(result.data.request.body).toEqual({});
		expect(result.data.description).toBe('');
	});
});

describe('CapabilitiesSchema', () => {
	it('fills defaults', () => {
		const result = CapabilitiesSchema.safeParse({ tools: true });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.vision).toBe(false);
		expect(result.data.reasoning).toBe(false);
	});
});

describe('LimitSchema', () => {
	it('accepts valid limits', () => {
		const result = LimitSchema.safeParse({ context: 8192, output: 4096 });
		expect(result.success).toBe(true);
	});

	it('rejects non-positive limits', () => {
		expect(LimitSchema.safeParse({ context: 0, output: 4096 }).success).toBe(false);
	});
});

describe('VariantSchema', () => {
	it('fills defaults', () => {
		const result = VariantSchema.safeParse({ id: 'low', label: 'Low latency' });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.headers).toEqual({});
		expect(result.data.body).toEqual({});
	});
});

describe('CostSchema', () => {
	it('fills cache defaults', () => {
		const result = CostSchema.safeParse({ input: 1, output: 2 });
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.cache).toEqual({ read: 0, write: 0 });
	});
});

describe('ModelInfoSchema', () => {
	it('accepts minimal valid model', () => {
		const result = ModelInfoSchema.safeParse({
			id: 'llama-3-8b',
			providerId: 'groq',
			name: 'Llama 3 8B',
			capabilities: { tools: true },
			limit: { context: 8192, output: 4096 },
			tier: 'mid'
		});
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.data.status).toBe('active');
		expect(result.data.enabled).toBe(true);
		expect(result.data.variants).toEqual([]);
	});

	it('rejects model without required fields', () => {
		const result = ModelInfoSchema.safeParse({ id: 'x' });
		expect(result.success).toBe(false);
	});
});
