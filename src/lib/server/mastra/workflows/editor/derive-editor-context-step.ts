import { createStep } from '@mastra/core/workflows';
import { editorCommandRequestSchema, derivedEditorCommandSchema } from '$lib/server/mastra/editor/schemas';

export const deriveEditorContextStep = createStep({
	id: 'derive-editor-context',
	inputSchema: editorCommandRequestSchema,
	outputSchema: derivedEditorCommandSchema,
	execute: async ({ inputData }) => {
		const { ctx, messages, model } = inputData;
		const hasSelection = !!ctx.selectedText;

		return {
			ctx,
			messages,
			model,
			hasSelection,
			toolName: ctx.toolName ?? (hasSelection ? 'edit' : 'generate'),
		};
	},
});

