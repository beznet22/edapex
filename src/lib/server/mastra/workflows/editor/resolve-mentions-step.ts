import { createStep } from '@mastra/core/workflows';
import { derivedEditorCommandSchema, resolvedMentionsSchema } from '../../editor/schemas';
import { resolveMentionsInMarkdown } from '../../editor/mention-resolver';

export const resolveMentionsStep = createStep({
	id: 'resolve-mentions',
	inputSchema: derivedEditorCommandSchema,
	outputSchema: resolvedMentionsSchema,
	execute: async ({ inputData, requestContext, mastra }) => {
		const resolved = await resolveMentionsInMarkdown(
			inputData.ctx.markdown,
			requestContext,
			mastra,
		);

		return {
			...inputData,
			resolvedMarkdown: resolved.markdown,
			mentions: resolved.mentions,
		};
	},
});

