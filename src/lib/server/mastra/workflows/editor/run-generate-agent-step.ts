import { createStep } from '@mastra/core/workflows';
import { resolvedEditorCommandSchema, editorCommandResultSchema } from '$lib/server/mastra/editor/schemas';
import { stripLeakedSelection } from '$lib/server/mastra/editor/strip-leaked-selection';
import { streamWithAutoRetry } from '$lib/server/mastra/agent-stream-retry';

export const runGenerateAgentStep = createStep({
	id: 'run-generate-agent',
	inputSchema: resolvedEditorCommandSchema,
	outputSchema: editorCommandResultSchema,
	execute: async ({
		abortSignal,
		inputData,
		mastra,
		requestContext,
		writer,
	}) => {
		const agent = mastra.getAgent('editorGenerate');
		const stream = await streamWithAutoRetry({
			stream: () =>
				agent.stream(inputData.prompt, {
					abortSignal,
					modelSettings: { temperature: 0.4, maxOutputTokens: 2000 },
					requestContext,
				}),
			abortSignal,
			writer
		});

		await stream.fullStream.pipeTo(writer);

		return {
			branch: 'generate' as const,
			text: stripLeakedSelection(await stream.text),
		};
	},
});

