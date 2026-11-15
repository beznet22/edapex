import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withResolverTrace, type TraceableResolution, type ResolverTrace } from './trace';
import * as auditLog from '$lib/server/audit-log';
import type { ModelId, ProviderId } from './types';

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

describe('structured resolver trace decorator', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('writes a success trace with provider, model, variant, tier, latency, keySource and scope', async () => {
		const result: TraceableResolution = {
			providerId: 'groq' as ProviderId,
			modelName: 'llama-3.3-70b',
			variantId: 'low',
			keySource: 'user'
		};
		const resolved = await withResolverTrace(
			async () => result,
			{ userId: 42, schoolId: 7, actorStaffId: 5 },
			{ modelId: 'groq/llama-3.3-70b' as ModelId, tier: 1, scope: 'user' }
		);

		expect(resolved).toBe(result);
		expect(auditLog.log).toHaveBeenCalledTimes(1);
		const call = vi.mocked(auditLog.log).mock.calls[0][0];
		expect(call.action).toBe('access');
		expect(call.entityType).toBe('providerResolution');
		expect(call.entityId).toBe('42:groq');
		const after = call.after as ResolverTrace;
		expect(after).toMatchObject({
			provider: 'groq',
			model: 'groq/llama-3.3-70b',
			variant: 'low',
			tier: 1,
			keySource: 'user',
			outcome: 'success',
			scope: 'user'
		});
		expect(typeof after.latencyMs).toBe('number');
		expect(after.latencyMs).toBeGreaterThanOrEqual(0);
	});

	it('records error outcome and error class name when the wrapped function throws', async () => {
		class CustomResolverError extends Error {
			constructor() {
				super('boom');
				this.name = 'CustomResolverError';
			}
		}

		await expect(
			withResolverTrace(
				async () => {
					throw new CustomResolverError();
				},
				{ userId: 42, schoolId: 7, actorStaffId: 5 },
				{ modelId: 'deepseek/chat' as ModelId, tier: 3, scope: 'school' }
			)
		).rejects.toBeInstanceOf(CustomResolverError);

		expect(auditLog.log).toHaveBeenCalledTimes(1);
		const call = vi.mocked(auditLog.log).mock.calls[0][0];
		const after = call.after as ResolverTrace;
		expect(after).toMatchObject({
			provider: 'deepseek',
			model: 'deepseek/chat',
			variant: null,
			tier: 3,
			keySource: null,
			outcome: 'error',
			scope: 'school',
			errorType: 'CustomResolverError'
		});
	});

	it('uses default scope/tier when not supplied', async () => {
		const result: TraceableResolution = {
			providerId: 'opencode' as ProviderId,
			modelName: 'qwen',
			variantId: null,
			keySource: 'env'
		};
		await withResolverTrace(
			async () => result,
			{ userId: 1, schoolId: 1, actorStaffId: 1 },
			{ modelId: 'opencode/qwen' as ModelId }
		);
		const call = vi.mocked(auditLog.log).mock.calls[0][0];
		const after = call.after as ResolverTrace;
		expect(after).toMatchObject({
			tier: null,
			scope: null,
			keySource: 'env'
		});
	});
});
