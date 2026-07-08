import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowInputSchema, fileStreamItemSchema } from '../../utils/chat-schemas';
import type { FileStreamItem } from '../../utils/chat-schemas';

export const classifyStep = createStep({
	id: 'classify',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: z.array(fileStreamItemSchema),
	execute: async ({ inputData }) => {
		console.log("CLASSIFY HIT");
		if (inputData.fileReferences.length === 0) {
			return [];
		}

		const fileItems: FileStreamItem[] = inputData.fileReferences.map((ref) => {
			const idSeed =
				ref.toolCallId ?? ref.fileId ?? ref.key ?? ref.contentHash ?? Math.random().toString(36).slice(2);
			return {
				toolCallId: ref.toolCallId ?? `doc-${idSeed}`,
				fileId: ref.fileId ?? ref.key,
				contentHash: ref.contentHash,
				fileName: ref.name ?? ref.fileId ?? ref.key ?? 'document',
				status: 'streaming' as const
			};
		});

		return fileItems;
	}
});

