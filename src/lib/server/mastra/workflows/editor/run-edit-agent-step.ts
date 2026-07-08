import { createStep } from '@mastra/core/workflows';
import { resolvedEditorCommandSchema, editorCommandResultSchema } from '../../editor/schemas';
import { stripLeakedSelection } from '../../editor/strip-leaked-selection';
import { streamWithAutoRetry } from '../../agent-stream-retry';

export const runEditAgentStep = createStep({
	id: 'run-edit-agent',
	inputSchema: resolvedEditorCommandSchema,
	outputSchema: editorCommandResultSchema,
	execute: async ({
		abortSignal,
		inputData,
		mastra,
		requestContext,
		writer,
	}) => {
		const agent = mastra.getAgent('editorEdit');
		const stream = await streamWithAutoRetry({
			stream: () =>
				agent.stream(inputData.prompt, {
					abortSignal,
					modelSettings: { temperature: 0.0, maxOutputTokens: 2000 },
					requestContext,
				}),
			abortSignal,
			writer
		});

		await stream.fullStream.pipeTo(writer);

		return {
			branch: 'edit' as const,
			text: stripLeakedSelection(await stream.text),
		};
	},
});

