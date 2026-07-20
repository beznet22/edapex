/**
 * Tests for `buildWorkspaceRequestContext` — the helper that non-chat
 * routes use to compose a per-request `RequestContext`.
 *
 * Locks the contract that when a pre-resolved `modelConfig` (from the
 * 4-tier router, tier 1 user key) is supplied, it lands in the
 * RequestContext under the same keys the chat pipeline uses
 * (`modelConfig`, `providerOptions`). Without this, agents in those
 * routes fall through to their per-call env defaults.
 */
import { describe, it, expect } from 'vitest';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import type { MastraModelConfig } from '@mastra/core/llm';

const tenant = createTenantContext({
	schoolId: 1,
	userId: 42,
	staffId: 7,
	designationId: 1,
	classId: 18,
	sectionId: 6,
	academicId: 5,
	className: 'LOWER BASIC 2',
	sectionName: 'B',
	academicYearTitle: '2024-2025'
});

describe('buildWorkspaceRequestContext', () => {
	it('writes tenantContext when no model config is supplied', () => {
		const rc = buildWorkspaceRequestContext(tenant);
		expect(rc.get('tenantContext')).toBe(tenant);
		expect(rc.get('modelConfig')).toBeUndefined();
		expect(rc.get('providerOptions')).toBeUndefined();
	});

	it('writes modelConfig to the context when supplied (user key lands here)', () => {
		const userKeyConfig: MastraModelConfig = {
			id: 'groq/llama-3.1-8b-instant',
			url: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-from-tier-1-user-key',
			headers: {}
		};
		const rc = buildWorkspaceRequestContext(tenant, { config: userKeyConfig });
		expect(rc.get('modelConfig')).toBe(userKeyConfig);
		expect(rc.get('tenantContext')).toBe(tenant);
	});

	it('writes providerOptions alongside modelConfig when supplied', () => {
		const config: MastraModelConfig = {
			id: 'groq/openai/gpt-oss-120b',
			url: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-from-tier-1',
			headers: {}
		};
		const providerOptions = { groq: { thinking: { effort: 'low' } } };
		const rc = buildWorkspaceRequestContext(tenant, { config, providerOptions });
		expect(rc.get('modelConfig')).toBe(config);
		expect(rc.get('providerOptions')).toBe(providerOptions);
	});

	it('omits providerOptions when only config is supplied', () => {
		const config: MastraModelConfig = {
			id: 'groq/llama-3.1-8b-instant',
			url: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-tier-1',
			headers: {}
		};
		const rc = buildWorkspaceRequestContext(tenant, { config });
		expect(rc.get('modelConfig')).toBe(config);
		expect(rc.get('providerOptions')).toBeUndefined();
	});

	it('passes through the exact reference (no clone/copy)', () => {
		const config: MastraModelConfig = {
			id: 'groq/llama-3.1-8b-instant',
			url: 'https://api.groq.com/openai/v1',
			apiKey: 'gsk-same-ref',
			headers: {}
		};
		const rc = buildWorkspaceRequestContext(tenant, { config });
		expect(rc.get('modelConfig')).toBe(config);
		expect((rc.get('modelConfig') as { apiKey: string }).apiKey).toBe('gsk-same-ref');
	});
});
