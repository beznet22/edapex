import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

interface ChooseDocumentContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
    set<T = unknown>(key: string, value: T): void;
  };
}

export const chooseDocumentTool = createTool({
  id: 'choose-document',
  description:
    'Record which uploaded marksheet the teacher wants to process when multiple are attached. ' +
    'Sets defaultDocumentId in the request context so subsequent tools resolve to the chosen one.',
  inputSchema: z.object({
    documentId: z.string(),
  }),
  outputSchema: z.object({
    selectedDocumentId: z.string(),
  }),
  execute: async (input, ctx) => {
    const context = ctx as ChooseDocumentContext;
    const requestContext = context.requestContext;
    if (!requestContext) {
      throw new Error('REQUEST_CONTEXT_REQUIRED: choose-document requires an active request context');
    }
    requestContext.set('defaultDocumentId', input.documentId);
    return { selectedDocumentId: input.documentId };
  },
});
