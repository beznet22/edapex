import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import {
	agentLoopOutputSchema,
	chatWorkflowInputSchema,
	fileStreamItemSchema,
} from '../../utils/chat-schemas';
import { writeDataPart, type MemoryContext } from '../../utils/chat-utils';
import { streamWithAutoRetry } from '../../agent-stream-retry';

const inputSchema = z.object({
	promptText: z.string(),
	threadId: z.string(),
	resourceId: z.string(),
	resolvedFiles: z.array(fileStreamItemSchema).default([]),
	iteration: z.number().int().nonnegative().default(0)
});

export const agentLoopStep = createStep({
	id: 'agent-loop',
	description:
		'Runs the assistant agent one cycle. Returns done when no tool calls are emitted, continue when tools are executed (the AI SDK handles inline tool execution within maxSteps=1), awaiting-hitl when a HITL tool suspended the workflow.',
	inputSchema,
	outputSchema: agentLoopOutputSchema,
	execute: async ({
		inputData,
		mastra: m,
		requestContext,
		writer,
		abortSignal,
		runId
	}) => {
		const agent = m?.getAgent('assistant');
		if (!agent) throw new Error('Assistant agent not registered on Mastra instance');

		if (writer && requestContext) requestContext.set('writer', writer);

		const memCtx: MemoryContext = {
			threadId: inputData.threadId,
			resourceId: inputData.resourceId
		};

		const stream = await streamWithAutoRetry({
			stream: () =>
				agent.stream(inputData.promptText, {
					...(abortSignal ? { abortSignal } : {}),
					...(requestContext ? { requestContext } : {}),
					memory: {
						thread: inputData.threadId,
						resource: inputData.resourceId
					},
					// One round per workflow iteration; the .dountil() loop drives
					// continuation. With maxSteps=1 the AI SDK executes inline tool
					// calls and appends results to thread memory in a single round,
					// so the NEXT iteration sees the tool results.
					maxSteps: 1,
					onError: ({ error }) => {
						console.error('[agent-loop] stream error:', error);
					}
				}),
			abortSignal,
			writer,
			memCtx
		});

		const toolCalls: Array<{ toolCallId: string; toolName: string }> = [];
		let text = '';

		for await (const chunk of stream.fullStream) {
			if (chunk.type === 'text-delta') {
				text += chunk.payload.text;
			} else if (chunk.type === 'tool-call') {
				toolCalls.push({
					toolCallId: chunk.payload.toolCallId,
					toolName: chunk.payload.toolName
				});
			} else if (chunk.type === 'error') {
				console.error('[agent-loop] stream error chunk:', chunk.payload.error);
			}
		}

		if (toolCalls.length === 0) {
			return {
				status: 'done' as const,
				text,
				toolCallIds: [],
				iteration: inputData.iteration
			};
		}

		return {
			status: 'continue' as const,
			text,
			toolCallIds: toolCalls.map((tc) => tc.toolCallId),
			iteration: inputData.iteration + 1
		};
	}
});
