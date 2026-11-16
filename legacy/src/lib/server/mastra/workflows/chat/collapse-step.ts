import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowInputSchema, fileStreamItemSchema, workflowEnvelopeSchema } from '$lib/server/mastra/utils/chat-schemas';

export const collapseStep = createStep({
	id: 'collapse-stream-results',
	inputSchema: z.array(fileStreamItemSchema),
	outputSchema: workflowEnvelopeSchema,
	execute: async ({ inputData, getInitData }) => {
		const initial = getInitData() as z.infer<typeof chatWorkflowInputSchema>;
		return {
			threadId: initial.threadId,
			resourceId: initial.resourceId,
			promptText: initial.promptText,
			requestContext: initial.requestContext,
			abortSignal: initial.abortSignal,
			fileItems: inputData
		};
	}
});

