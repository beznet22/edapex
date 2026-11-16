import { describe, it, expect } from 'vitest';
import { ProviderIdSchema, ModelIdSchema, VariantIdSchema, parseModelId } from './types';

describe('types schemas', () => {
	it('validates provider ids', () => {
		expect(ProviderIdSchema.safeParse('groq').success).toBe(true);
		expect(ProviderIdSchema.safeParse('').success).toBe(false);
		expect(ProviderIdSchema.safeParse('Groq!').success).toBe(false);
	});

	it('validates model ids', () => {
		expect(ModelIdSchema.safeParse('llama-3').success).toBe(true);
		expect(ModelIdSchema.safeParse('').success).toBe(false);
	});

	it('validates variant ids', () => {
		expect(VariantIdSchema.safeParse('low').success).toBe(true);
		expect(VariantIdSchema.safeParse('').success).toBe(false);
		expect(VariantIdSchema.safeParse('LOW').success).toBe(false);
	});
});

describe('parseModelId', () => {
	it('parses plain model id', () => {
		const parsed = parseModelId('llama-3-8b');
		expect(parsed.modelId).toBe('llama-3-8b');
		expect(parsed.variantId).toBeNull();
	});

	it('parses model id with variant', () => {
		const parsed = parseModelId('llama-3-8b@low');
		expect(parsed.modelId).toBe('llama-3-8b');
		expect(parsed.variantId).toBe('low');
	});

	it('uses first @ for variant split', () => {
		const parsed = parseModelId('a@b@c');
		expect(parsed.modelId).toBe('a');
		expect(parsed.variantId).toBe('b@c');
	});
});
