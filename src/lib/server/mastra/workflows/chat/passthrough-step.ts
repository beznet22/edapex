import { createStep } from '@mastra/core/workflows';
import {
	chatWorkflowOutputSchema,
	workflowEnvelopeSchema
} from '../../utils/chat-schemas';

export const passthroughStep = createStep({
	id: 'passthrough',
	description:
		'No-op terminal step used when no marksheet validation is needed. Returns an empty output so the workflow can complete without emitting or committing anything.',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: chatWorkflowOutputSchema,
	execute: async ({ inputData }) => ({
		text: '',
		resolvedFiles: inputData.fileItems ?? []
	})
});
