/**
 * Structured resolver trace decorator.
 *
 * Every invocation of the decorated resolver function writes one
 * `providerResolution` audit-log entry containing the provider, model,
 * variant, tier, latency, key source, outcome, and scope. The entry never
 * contains plaintext keys.
 */
import { log as writeAudit } from '$lib/server/audit-log';
import type { ProviderId, ModelId, VariantId } from './types';

export type ResolverOutcome = 'success' | 'error';
export type ResolverScope = 'user' | 'school' | null;

export interface ResolverTrace {
	provider: ProviderId;
	model: ModelId;
	variant: VariantId | null;
	tier: number | null;
	latencyMs: number;
	keySource: 'user' | 'env' | 'pool' | null;
	outcome: ResolverOutcome;
	scope: ResolverScope;
	errorType?: string;
}

export interface ResolverTraceContext {
	userId: number;
	schoolId: number;
	actorStaffId: number;
}

export interface TraceableResolution {
	providerId: ProviderId;
	modelName: string;
	variantId: VariantId | null;
	keySource: 'user' | 'env' | 'pool' | null;
	tier?: number | null;
}

/**
 * Wrap a resolver so it emits a structured trace entry for every call.
 *
 * The wrapped function must return an object with providerId, modelName,
 * variantId, and keySource. If it throws, the trace records the error class
 * name and re-throws.
 */
export function withResolverTrace<T extends TraceableResolution>(
	fn: () => Promise<T>,
	context: ResolverTraceContext,
	params: {
		modelId: ModelId;
		tier?: number | null;
		scope?: ResolverScope;
	}
): Promise<T> {
	const start = performance.now();
	return fn()
		.then(async (result) => {
			const trace = buildTrace(result, params.modelId, params.tier ?? null, params.scope ?? null, start, 'success');
			await emitTrace(context, trace);
			return result;
		})
		.catch(async (err) => {
			const fallback: TraceableResolution = {
				providerId: (params.modelId.split('/')[0] ?? 'unknown') as ProviderId,
				modelName: params.modelId,
				variantId: null,
				keySource: null
			};
			const trace = buildTrace(fallback, params.modelId, params.tier ?? null, params.scope ?? null, start, 'error', err);
			await emitTrace(context, trace);
			throw err;
		});
}

function buildTrace(
	resolution: TraceableResolution,
	modelId: ModelId,
	tier: number | null,
	scope: ResolverScope,
	start: number,
	outcome: ResolverOutcome,
	err?: unknown
): ResolverTrace {
	const latencyMs = Math.round(performance.now() - start);
	const trace: ResolverTrace = {
		provider: resolution.providerId,
		model: modelId,
		variant: resolution.variantId,
		tier: resolution.tier ?? tier,
		latencyMs,
		keySource: resolution.keySource,
		outcome,
		scope
	};
	if (outcome === 'error' && err instanceof Error) {
		trace.errorType = err.constructor.name;
	}
	return trace;
}

async function emitTrace(context: ResolverTraceContext, trace: ResolverTrace): Promise<void> {
	await writeAudit({
		schoolId: context.schoolId,
		actorStaffId: context.actorStaffId,
		action: 'access',
		entityType: 'providerResolution',
		entityId: `${context.userId}:${trace.provider}`,
		before: { requested: true },
		after: trace
	});
}
