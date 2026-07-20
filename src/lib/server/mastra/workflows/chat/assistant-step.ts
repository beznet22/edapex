/**
 * Assistant workflow step.
 *
 * Streams the assistant agent's response. Reasoning UI streaming state comes
 * from AI SDK `ReasoningUIPart.state` on the client. This step only *measures*
 * per-block durations (via reasoning-delta id boundaries) and persists them
 * once after the stream lands as a single `data-reasoningMeta` part so
 * durations survive page reload.
 *
 * Mastra typically emits `reasoning-delta` chunks at runtime — typed
 * `reasoning-start` / `reasoning-end` may be absent — so block boundaries are
 * detected from payload-id changes and non-delta transitions.
 */

import { createStep, type ChunkType } from '@mastra/core/workflows';
import type { ToolsetsInput } from '@mastra/core/agent';
import { z } from 'zod';
import { chatWorkflowOutputSchema, workflowEnvelopeSchema } from '../../utils/chat-schemas';
import { writeDataPart } from '../../utils/chat-utils';
import { streamWithAutoRetry } from '../../agent-stream-retry';
import { recordUsage } from '../../provider/usage-tracker';
import { getAppDb } from '../../storage/libsql/app-db';

/**
 * `resolveToolsStep` (chained immediately before this step) attaches the
 * merged skill + base toolset as `tools`. Make it required on the input
 * contract so downstream code can rely on it.
 */
const assistantStepInputSchema = workflowEnvelopeSchema.extend({
	tools: z.custom<ToolsetsInput>()
});

interface ReasoningDurationTracker {
	onChunk: (chunk: ChunkType) => void;
	close: () => void;
	getDurations: () => number[];
}

/** Subset of AI SDK `LanguageModelUsage` fields consumed by the onFinish callback. */
interface UsageLike {
	inputTokens?: number;
	outputTokens?: number;
	reasoningTokens?: number;
	cachedInputTokens?: number;
}

/**
 * Emit a transient `data-credentialTrace` stream part so the dev console
 * (and any client-side listeners) can see which credential source served
 * the request. Reads the `modelConfig` written by `buildRequestContext`
 * in `chat-helper.ts` — its id is `<providerId>/<modelName>`. The actual
 * `apiKey` is the one the assistant step is about to use, so the
 * fingerprint here matches the upstream's view of the request.
 */
async function writeCredentialTrace(
	writer: unknown,
	requestContext: { get<T = unknown>(key: string): T | undefined } | undefined,
	memCtx: { threadId: string; resourceId: string } | undefined,
	runId: string | undefined
): Promise<void> {
	try {
		const cfg = requestContext?.get('modelConfig') as
			| { id?: string; url?: string; apiKey?: string }
			| undefined;
		if (!cfg) return;
		const slashIdx = cfg.id?.indexOf('/') ?? -1;
		const providerId = slashIdx > 0 ? cfg.id!.slice(0, slashIdx) : null;
		const apiKey = cfg.apiKey ?? '';
		const fingerprint = apiKey
			? `${apiKey.slice(0, 4)}…${apiKey.slice(-4)}`
			: '(empty)';
		await writeDataPart(writer as never, {
			data: {
				type: 'data-credentialTrace',
				id: `cred-trace-${runId ?? Date.now()}`,
				data: {
					providerId,
					baseUrl: cfg.url,
					keyFingerprint: fingerprint,
					keySource: apiKey ? 'user' : 'env-fallback',
					tier: apiKey ? 1 : 3
				}
			},
			memory: memCtx,
			transient: true
		});
	} catch {
		// best-effort diagnostic — never break the stream
	}
}

/**
 * Measure-only tracker: records wall-clock seconds per reasoning block.
 * Emits nothing during the stream — the caller flushes durations after
 * `pipeTo` so memory persistence can attach to the assistant message.
 */
function createReasoningDurationTracker(): ReasoningDurationTracker {
	let currentBlockId: string | null = null;
	let currentBlockStart = 0;
	const durations: number[] = [];

	const closeOpenBlock = () => {
		if (currentBlockId === null) return;
		durations.push((Date.now() - currentBlockStart) / 1000);
		currentBlockId = null;
		currentBlockStart = 0;
	};

	return {
		onChunk: (chunk: ChunkType) => {
			if (chunk.type === 'reasoning-delta') {
				const payloadId = chunk.payload?.id ?? null;
				if (payloadId !== null && payloadId !== currentBlockId) {
					closeOpenBlock();
					currentBlockId = payloadId;
					currentBlockStart = Date.now();
				}
			} else {
				closeOpenBlock();
			}
		},
		close: closeOpenBlock,
		getDurations: () => durations.slice()
	};
}

export const assistantStep = createStep({
	id: 'assistant',
	inputSchema: assistantStepInputSchema,
	outputSchema: chatWorkflowOutputSchema,
	execute: async ({ inputData, mastra: m, requestContext, writer, abortSignal, runId }) => {
		const agent = m?.getAgent('assistant');
		if (!agent) {
			throw new Error('Assistant agent not registered on Mastra instance');
		}

		const memCtx = { threadId: inputData.threadId, resourceId: inputData.resourceId };
		const providerOptions = requestContext?.get('providerOptions') as
			| Record<string, Record<string, unknown>>
			| undefined;
		const reasoning = createReasoningDurationTracker();

		const agentOptions = {
			...(runId ? { runId } : {}),
			...(abortSignal ? { abortSignal } : {}),
			...(requestContext ? { requestContext } : {}),
			...(providerOptions ? { providerOptions: providerOptions as never } : {}),
			toolsets: inputData.tools,
			memory: { thread: inputData.threadId, resource: inputData.resourceId },
			maxSteps: 30,
			onChunk: (chunk: any) => reasoning.onChunk(chunk),
			onFinish: (event: { usage: UsageLike }) => {
				const { usage } = event;
				reasoning.close();
				// Token usage is conversation-scoped, not message-attached — fire-and-forget.
				writeDataPart(writer, {
					data: {
						type: 'data-usage',
						id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
						data: {
							inputTokens: usage.inputTokens ?? 0,
							outputTokens: usage.outputTokens ?? 0,
							reasoningTokens: usage.reasoningTokens ?? 0,
							cachedInputTokens: usage.cachedInputTokens ?? 0
						}
					},
					memory: memCtx,
					transient: true
				}).catch(() => { });

				// Persist today's per-user usage so the 4-tier router's tier-2
				// `perUserDailyTokenCap` check can fire on the next request.
				// Resolve the provider from the modelConfig the chat-helper
				// stored in requestContext (Mastra's config id is
				// `<providerId>/<modelName>`). Fire-and-forget — a failed
				// write must never crash the response stream.
				const totalTokens =
					(usage.inputTokens ?? 0) +
					(usage.outputTokens ?? 0) +
					(usage.reasoningTokens ?? 0);
				if (totalTokens > 0) {
					const modelConfig = requestContext?.get('modelConfig') as
						| { id?: string }
						| undefined;
					const slashIdx = modelConfig?.id?.indexOf('/') ?? -1;
					const providerId = slashIdx > 0 ? modelConfig!.id!.slice(0, slashIdx) : null;
					const userId = Number(inputData.resourceId);
					if (providerId && Number.isFinite(userId) && userId > 0) {
						recordUsage({
							db: getAppDb(),
							userId,
							providerId,
							tokens: totalTokens
						}).catch((err) =>
							console.error('[assistant-step] recordUsage failed', err)
						);
					}
				}
			}
		};

		const stream = await streamWithAutoRetry({
			stream: () => agent.stream(inputData.promptText, agentOptions),
			abortSignal,
			writer,
			memCtx
		});

		await stream.fullStream.pipeTo(writer);

		// Emit a credential trace once the stream succeeded — gives the
		// dev console a way to confirm which credential source served
		// the request (tier 1 user key vs tier 2 pool vs tier 3 env).
		await writeCredentialTrace(writer, requestContext, memCtx, runId);
		reasoning.close();

		// Assistant message now exists in memory — safe to persist durable meta.
		const durations = reasoning.getDurations();
		if (runId && durations.length > 0) {
			await writeDataPart(writer, {
				data: {
					type: 'data-reasoningMeta',
					id: `rm-${runId}`,
					data: { durations }
				},
				memory: memCtx
			});
		}

		if (runId) {
			await writeDataPart(writer, {
				data: { type: 'data-runInfo', id: `ri-${runId}`, data: { runId } },
				memory: memCtx
			});
		}

		return {
			text: await stream.text,
			resolvedFiles: inputData.fileItems
		};
	}
});
