import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { fileStreamItemSchema } from '../../utils/chat-schemas';

export const extractFileItemsStep = createStep({
	id: 'extract-file-items',
	description: 'Flattens the `.parallel()` record into the array contract required by collapseStep',
	inputSchema: z.object({
		'classify-and-stream': z.array(fileStreamItemSchema),
		title: z.object({})
	}),
	outputSchema: z.array(fileStreamItemSchema),
	execute: async ({ inputData }: { inputData: { 'classify-and-stream': z.infer<typeof fileStreamItemSchema>[]; title: Record<string, unknown> } }) =>
		inputData['classify-and-stream']
});
