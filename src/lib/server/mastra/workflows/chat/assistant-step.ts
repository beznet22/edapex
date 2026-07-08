import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowOutputSchema, workflowEnvelopeSchema } from '../../utils/chat-schemas';
import { writeDataPart } from '../../utils/chat-utils';
import { streamWithAutoRetry } from '../../agent-stream-retry';

export const assistantStep = createStep({
	id: 'assistant',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: chatWorkflowOutputSchema,
	execute: async ({ inputData, getInitData, mastra: m, requestContext, writer, abortSignal, runId }) => {
		console.log('ASSISTANT HIT');
		const agent = m?.getAgent('assistant');
		if (!agent) {
			throw new Error('Assistant agent not registered on Mastra instance');
		}

		console.log('fileItems', inputData.fileItems);

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

		// Workflow-internal flag — transient (client sees it during stream,
		// never persisted to message history).
		await writeDataPart(writer, {
			data: {
				type: 'data-isCustomPersistence',
				id: 'isCustomPersistence',
				data: { isCustomPersistence: true }
			},
			memory: memCtx,
			transient: true,
		});

		const stream = await streamWithAutoRetry({
			stream: () =>
				agent.stream(inputData.promptText, {
					...(abortSignal ? { abortSignal: abortSignal } : {}),
					...(requestContext ? { requestContext: requestContext } : {}),
					...(requestContext?.get('providerOptions')
						? { providerOptions: requestContext.get('providerOptions') as Record<string, Record<string, unknown>> as never }
						: {}),
					memory: {
						thread: inputData.threadId,
						resource: inputData.resourceId
					},
					maxSteps: 30,
					onError: ({ error }) => {
						const msg = error instanceof Error ? error.message : String(error);
						if (msg.includes('AbortError') || msg.includes('aborted')) {
							console.info('[api/chat] Generation stopped.');
							return;
						}
						console.error(`[api/chat] Error: ${msg}`);
					},
					onFinish: ({ usage }) => {
						const simple = {
							inputTokens: usage.inputTokens ?? 0,
							outputTokens: usage.outputTokens ?? 0,
							reasoningTokens: usage.reasoningTokens ?? 0,
							cachedInputTokens: usage.cachedInputTokens ?? 0
						};
						// Token usage is conversation-scoped, not message-attached — transient.
						writeDataPart(writer, {
							data: {
								type: 'data-usage',
								id: `usage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
								data: simple,
							},
							memory: memCtx,
							transient: true,
						}).catch(() => { });
					}
				}),
			abortSignal,
			writer
		});

		await stream.fullStream.pipeTo(writer);

		// After pipeTo completes, the agent's messageList has been persisted.
		// Emit data-runInfo so the client knows the runId for resume operations.
		// Persisted via writeDataPart so recall() rehydrates activeRunId on reload.
		if (runId) {
			await writeDataPart(writer, {
				data: {
					type: 'data-runInfo',
					id: `ri-${runId}`,
					data: { runId },
				},
				memory: memCtx,
			});
		}

		return {
			text: await stream.text,
			resolvedFiles: inputData.fileItems
		};
	}
});
