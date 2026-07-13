/**
 * Assistant workflow step.
 *
 * Streams the assistant agent's response and emits reasoning lifecycle
 * events to the client. Reasoning events are emitted PER BLOCK (not per
 * step): each run of `reasoning-delta` chunks that share the same
 * `chunk.payload.id` is one block, and a block ends the moment a non-delta
 * chunk arrives. The client pairs these events by occurrence index via
 * `chat.buildReasoningStateMap` (see `chat-context.svelte.ts`), so every
 * `<Reasoning>` instance gets its own `isStreaming` / `duration` and
 * no two blocks share state.
 *
 * Mastra only emits `reasoning-delta` chunks at runtime — the typed
 * `reasoning-start` / `reasoning-end` chunks are never produced — so
 * block boundaries are detected from id-changes and non-delta transitions.
 */

import { createStep, type ChunkType } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowOutputSchema, workflowEnvelopeSchema } from '../../utils/chat-schemas';
import { writeDataPart } from '../../utils/chat-utils';
import { streamWithAutoRetry } from '../../agent-stream-retry';

/**
 * `resolveToolsStep` (chained immediately before this step) attaches the
 * merged skill + base toolset as `tools`. Make it required on the input
 * contract so downstream code can rely on it.
 */
const assistantStepInputSchema = workflowEnvelopeSchema.extend({
	tools: z.record(z.string(), z.unknown())
});

const REASONING_TICK_MS = 3000;

interface ReasoningTracker {
	onChunk: (chunk: ChunkType) => Promise<void>;
	close: () => Promise<void>;
}

/**
 * Creates a per-reasoning-block tracker. Each invocation owns its own
 * state (current block id, start time, periodic timer) so no globals
 * leak across turns. A no-op when `runId` is undefined (e.g. unit tests).
 */
function createReasoningTracker(
	runId: string | undefined,
	writer: Parameters<typeof writeDataPart>[0],
	memCtx: { threadId: string; resourceId: string }
): ReasoningTracker {
	let blockIndex = 0;
	let currentBlockId: string | null = null;
	let currentBlockStart = 0;
	let timer: ReturnType<typeof setInterval> | null = null;

	const emit = async (
		index: number,
		payload: { state: 'streaming' | 'done'; duration: number },
		transient: boolean
	) => {
		if (!runId) return;
		await writeDataPart(writer, {
			data: {
				type: 'data-reasoning',
				id: `${runId}-reasoning-${index}`,
				data: payload
			},
			memory: memCtx,
			transient
		});
	};

	const closeCurrentBlock = async () => {
		if (currentBlockId === null) return;
		const index = blockIndex;
		const startedAt = currentBlockStart;
		currentBlockId = null;
		currentBlockStart = 0;
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		await emit(index, { state: 'done', duration: (Date.now() - startedAt) / 1000 }, false);
	};

	return {
		onChunk: async (chunk: ChunkType) => {
			if (chunk.type === 'reasoning-delta') {
				const payloadId = (chunk.payload as { id?: string } | undefined)?.id ?? null;
				if (payloadId !== null && currentBlockId !== payloadId) {
					// New reasoning block: provider id changed or first delta.
					await closeCurrentBlock();
					blockIndex += 1;
					currentBlockId = payloadId;
					currentBlockStart = Date.now();
					await emit(blockIndex, { state: 'streaming', duration: 0 }, true);
					// Periodic ticker so long blocks surface "Thinking (Ns)…"
					// instead of an indeterminate shimmer. Cleared on close.
					timer = setInterval(async () => {
						if (currentBlockId !== payloadId) return;
						await emit(blockIndex, {
							state: 'streaming',
							duration: (Date.now() - currentBlockStart) / 1000
						}, true);
					}, REASONING_TICK_MS);
				}
				// Same block: the ticker (if running) handles duration updates.
			} else {
				// Any non-delta chunk closes the currently-open reasoning block.
				await closeCurrentBlock();
			}
		},
		close: closeCurrentBlock
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

		if (writer && requestContext) {
			requestContext.set('writer', writer);
		}

		if (inputData.fileItems.length > 0) {
			const manifestText = inputData.fileItems
				.map((f) => {
					const contentHash = f.fileId ?? f.contentHash ?? f.toolCallId;
					if ('error' in f) {
						return `- ${f.fileName} (contentHash: ${contentHash}) — Error: ${f.error}`;
					}
					return `- ${f.fileName} (contentHash: ${contentHash})`;
				})
				.join('\n');
			requestContext?.set('fileManifest', manifestText);
		}

		const memCtx = { threadId: inputData.threadId, resourceId: inputData.resourceId };
		const providerOptions = requestContext?.get('providerOptions') as
			| Record<string, Record<string, unknown>>
			| undefined;
		const reasoning = createReasoningTracker(runId, writer, memCtx);

		const baseAgentOptions = {
			...(runId ? { runId } : {}),
			...(abortSignal ? { abortSignal } : {}),
			...(requestContext ? { requestContext } : {}),
			...(providerOptions ? { providerOptions: providerOptions as never } : {}),
			tools: inputData.tools,
			memory: { thread: inputData.threadId, resource: inputData.resourceId },
			maxSteps: 30,
			onChunk: (chunk: any) => reasoning.onChunk(chunk),
			onStepFinish: async () => await reasoning.close(),
			onFinish: async ({
				usage
			}: {
				usage: {
					inputTokens?: number;
					outputTokens?: number;
					reasoningTokens?: number;
					cachedInputTokens?: number;
				};
			}) => {
				await reasoning.close();
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
					memory: memCtx
				}).catch(() => {});
			}
		};

		const stream = await streamWithAutoRetry({
			stream: () => agent.stream(inputData.promptText, baseAgentOptions),
			abortSignal,
			writer,
			memCtx
		});

		await stream.fullStream.pipeTo(writer);
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
