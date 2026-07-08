import { createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowInputSchema, fileStreamItemSchema } from '../../utils/chat-schemas';
import { classifyStep } from './classify-step';
import { streamDocumentStep } from './stream-document-step';

export const classifyAndStreamWorkflow = createWorkflow({
	id: 'classify-and-stream',
	description: 'classifyStep → foreach(streamDocumentStep, concurrency: 4)',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: z.array(fileStreamItemSchema)
})
	.then(classifyStep)
	.foreach(streamDocumentStep, { concurrency: 4 })
	.commit();

