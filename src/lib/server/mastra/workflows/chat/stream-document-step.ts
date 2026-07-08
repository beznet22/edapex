import { createStep } from '@mastra/core/workflows';
import { fileStreamItemSchema } from '../../utils/chat-schemas';

export const streamDocumentStep = createStep({
	id: 'stream-document',
	inputSchema: fileStreamItemSchema,
	outputSchema: fileStreamItemSchema,
	retries: 3,
	execute: async ({ inputData }) => {
		// Pass-through. Document streaming is now driven client-side by the
		// prepareDocumentStream tool call inside the assistant agent's turn.
		// The workspace panel renders the streamed markdown from a separate
		// Chat instance that runs streamDocumentAgentStep directly via
		// /api/chat?step=stream-document-agent.
		return inputData;
	}
});

