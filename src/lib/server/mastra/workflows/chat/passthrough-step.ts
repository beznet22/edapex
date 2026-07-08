import { createStep } from '@mastra/core/workflows';
import { chatWorkflowOutputSchema } from '../../utils/chat-schemas';

export const passthroughStep = createStep({
	id: 'passthrough',
	description:
		'No-op terminal step used when no marksheet validation is needed. Returns an empty output so the workflow can complete without emitting or committing anything.',
	// Accept the same shape the agent-loop `.dountil()` output feeds the
	// branch with (see workflows/index.ts). Both branches in that branch
	// (`awaitValidationStep`, `passthroughStep`) must share an input
	// schema for the branch to type-check.
	inputSchema: chatWorkflowOutputSchema,
	outputSchema: chatWorkflowOutputSchema,
	execute: async ({ inputData }) => ({
		text: inputData.text ?? '',
		resolvedFiles: inputData.resolvedFiles ?? []
	})
});
