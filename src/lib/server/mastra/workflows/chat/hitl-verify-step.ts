import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { workflowEnvelopeSchema } from '$lib/server/mastra/utils/chat-schemas';

export const hitlVerifyStep = createStep({
	id: 'hitl-verify',
	inputSchema: workflowEnvelopeSchema,
	outputSchema: workflowEnvelopeSchema,
	resumeSchema: z.object({
		approved: z.boolean(),
		corrections: z
			.array(
				z.object({
					toolCallId: z.string(),
					correctedContent: z.string()
				})
			)
			.optional()
	}),
	suspendSchema: z.object({
		reason: z.string(),
		fileIds: z.array(z.string())
	}),
	execute: async ({ inputData, resumeData }) => {
		console.log("HITL HIT");
		// No files: nothing to verify, just pass through.
		if (inputData.fileItems.length === 0) {
			return inputData;
		}

		// First-run (no resumeData): HITL is opt-in. Pass through.
		if (!resumeData) {
			return inputData;
		}

		// User rejected verification: keep original content.
		if (resumeData.approved === false) {
			return inputData;
		}

		// User approved and provided corrections: apply per-file.
		if (resumeData.corrections && resumeData.corrections.length > 0) {
			const updated = inputData.fileItems.map((item) => {
				const correction = resumeData.corrections!.find(
					(c) => c.toolCallId === item.toolCallId
				);
				if (correction) {
					return {
						...item,
						correctedContent: correction.correctedContent,
						content: correction.correctedContent
					};
				}
				return item;
			});
			return { ...inputData, fileItems: updated };
		}

		// Approved without corrections: pass through unchanged.
		return inputData;
	}
});

