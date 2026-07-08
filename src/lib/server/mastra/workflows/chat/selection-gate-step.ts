import { createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { chatWorkflowInputSchema, fileStreamItemSchema, optionItemSchema, pendingSelectionSchema } from '../../utils/chat-schemas';
import { writeDataPart, type MemoryContext } from '$lib/server/mastra/utils/chat-utils';

export const selectionGateStep = createStep({
	id: 'selectionGate',
	description: 'Reads pendingSelection from requestContext and suspends for user choice; on resume, persists the selection.',
	inputSchema: z.object({
		text: z.string(),
		resolvedFiles: z.array(fileStreamItemSchema).optional()
	}),
	outputSchema: z.object({
		selectedOptionId: z.string(),
		contextKey: z.string().nullable(),
		text: z.string(),
		resolvedFiles: z.array(fileStreamItemSchema).default([])
	}),
	suspendSchema: z.object({
		options: z.array(optionItemSchema),
		promptText: z.string(),
		contextKey: z.string()
	}),
	resumeSchema: z.object({
		selectedOptionId: z.string()
	}),
	execute: async ({ inputData, getInitData, requestContext, resumeData, suspend, writer, runId }) => {
		const init = getInitData() as z.infer<typeof chatWorkflowInputSchema>;
		const memCtx: MemoryContext = { threadId: init.threadId, resourceId: init.resourceId };

		const rawPending = requestContext?.get('pendingSelection');
		const parsed = pendingSelectionSchema.safeParse(rawPending);

		if (!parsed.success) {
			return { selectedOptionId: '', contextKey: null, text: inputData.text, resolvedFiles: inputData.resolvedFiles ?? [] };
		}

		const pending = parsed.data;

		if (!resumeData) {
			const gateId = `gate-${runId}-${Date.now()}`;
			await writeDataPart(writer, {
				data: {
					type: 'data-selectOption',
					id: gateId,
					data: {
						options: pending.options,
						promptText: pending.prompt,
						runId: runId ?? '',
						stepId: 'selectionGate'
					}
				},
				memory: memCtx,
			});
			await suspend({
				options: pending.options,
				promptText: pending.prompt,
				contextKey: pending.contextKey
			});
			return { selectedOptionId: '', contextKey: pending.contextKey, text: inputData.text, resolvedFiles: inputData.resolvedFiles ?? [] };
		}

		const selectedOption = pending.options.find((o) => o.id === resumeData.selectedOptionId);
		const label = selectedOption?.label ?? resumeData.selectedOptionId;
		requestContext?.set(pending.contextKey, resumeData.selectedOptionId);
		requestContext?.set(`${pending.contextKey}Label`, label);

		return {
			selectedOptionId: resumeData.selectedOptionId,
			contextKey: pending.contextKey,
			text: inputData.text,
			resolvedFiles: inputData.resolvedFiles ?? []
		};
	}
});

