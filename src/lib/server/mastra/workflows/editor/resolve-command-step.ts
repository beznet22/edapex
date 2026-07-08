import { createStep } from '@mastra/core/workflows';
import { resolvedMentionsSchema, resolvedEditorCommandSchema } from '../../editor/schemas';
import { buildEditPrompt, buildGeneratePrompt } from '../../editor/prompt-builders';

export const resolveCommandStep = createStep({
	id: 'resolve-command',
	inputSchema: resolvedMentionsSchema,
	outputSchema: resolvedEditorCommandSchema,
	execute: async ({ inputData }) => {
		const ctx = {
			...inputData.ctx,
			markdown: inputData.resolvedMarkdown,
		};
		const prompt =
			inputData.toolName === 'edit'
				? buildEditPrompt({ ...inputData, ctx } as any)
				: buildGeneratePrompt({ ...inputData, ctx } as any);

		return {
			...inputData,
			ctx,
			prompt,
		};
	},
});

