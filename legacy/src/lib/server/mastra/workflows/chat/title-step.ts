import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowInputSchema } from '$lib/server/mastra/utils/chat-schemas';
import { generateThreadTitle } from '$lib/server/helpers/chat-helper';

export const titleStep = createStep({
	id: 'title',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: z.object({}),
	execute: async ({ inputData, requestContext, writer, mastra: m }) => {
		const agent = m?.getAgent('assistant');
		const memory = agent ? await agent.getMemory() : undefined;
		try {
			await generateThreadTitle({
				resourceId: inputData.resourceId,
				memory,
				threadId: inputData.threadId,
				prompt: inputData.promptText,
				writer,
				requestContext
			});
		} catch (err) {
			console.error('Failed to generate thread title:', err);
		}

		return {};
	}
});
