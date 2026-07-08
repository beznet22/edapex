import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowInputSchema, chatWorkflowOutputSchema, fileStreamItemSchema } from '../../utils/chat-schemas';
import { streamWithAutoRetry } from '../../agent-stream-retry';

export const continuationAssistantStep = createStep({
	id: 'continuationAssistant',
	description: 'Re-streams the assistant with the user-selected option embedded in the prompt.',
	inputSchema: z.object({
		selectedOptionId: z.string(),
		contextKey: z.string().nullable(),
		text: z.string(),
		resolvedFiles: z.array(fileStreamItemSchema).default([])
	}),
	outputSchema: chatWorkflowOutputSchema,
	execute: async ({ inputData, getInitData, mastra: m, requestContext, writer, abortSignal }) => {
		if (inputData.contextKey === null || inputData.selectedOptionId === '') {
			return { text: '', resolvedFiles: [] };
		}

		const agent = m?.getAgent('assistant');
		if (!agent) throw new Error('Assistant agent not registered on Mastra instance');

		const init = getInitData() as z.infer<typeof chatWorkflowInputSchema>;
		const label = (requestContext?.get(`${inputData.contextKey}Label`) as string | undefined) ?? inputData.selectedOptionId;
		const memCtx = { threadId: init.threadId, resourceId: init.resourceId };

		const continuationPrompt = [
			`The user originally asked: "${init.promptText}".`,
			`They selected: "${label}" (id: ${inputData.selectedOptionId}).`,
			'Continue your response based on their selection.'
		].join('\n\n');

		const stream = await streamWithAutoRetry({
			stream: () =>
				agent.stream(continuationPrompt, {
					...(abortSignal ? { abortSignal: abortSignal } : {}),
					...(requestContext ? { requestContext: requestContext } : {}),
					...(requestContext?.get('providerOptions')
						? { providerOptions: requestContext.get('providerOptions') as Record<string, Record<string, unknown>> as never }
						: {}),
					memory: {
						thread: init.threadId,
						resource: init.resourceId
					},
					maxSteps: 30
				}),
			abortSignal,
			writer,
			memCtx
		});

		await stream.fullStream.pipeTo(writer);
		return {
			text: await stream.text,
			resolvedFiles: inputData.resolvedFiles
		};
	}
});

