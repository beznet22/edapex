/**
 * Editor Command Workflow — EdApex
 *
 * Resolves editor context, resolves @mentions against tenant data, and
 * executes edit or generate agents with streaming.
 *
 * Pipe:
 * 1. deriveEditorContextStep — decides edit vs generate, sets hasSelection.
 * 2. resolveMentionsStep — scans markdown for {{category:id}} placeholders,
 *    looks each up in the tenant-scoped DB, and replaces with resolved names
 *    so the LLM sees real data. Adds an `mentions` array to the input.
 * 3. resolveCommandStep — builds the final LLM prompt from the resolved markdown.
 * 4. branch — edit agent (temperature 0.0, deterministic) or generate agent (0.4).
 *
 * Each agent step defensively strips any leaked <Selection>...</Selection>
 * fragments and unbounded <outputFormatting> wrappers from the streamed text
 * before returning. The streamed chunks still pass through to the client
 * untouched (so the WYSIWYG shows text as it arrives), but the workflow's
 * final `text` field is sanitized.
 */
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { streamWithAutoRetry } from '../agent-stream-retry';
import {
	buildEditPrompt,
	buildGeneratePrompt,
} from '../editor/prompt-builders';
import { resolveMentionsInMarkdown } from '../editor/mention-resolver';
import {
	editorCommandRequestSchema,
	derivedEditorCommandSchema,
	resolvedMentionsSchema,
	resolvedEditorCommandSchema,
	editorCommandResultSchema,
	finalizedEditorCommandSchema,
} from '../editor/schemas';

const deriveEditorContextStep = createStep({
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

const resolveMentionsStep = createStep({
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

const resolveCommandStep = createStep({
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

function stripLeakedSelection(text: string): string {
	return text
		.replace(/<\/?Selection>/g, '')
		.replace(/<\/?backgroundData>/g, '')
		.replace(/<\/?outputFormatting>/g, '')
		.replace(/<\/?prefilledResponse>/g, '')
		.replace(/<\/?context>/g, '')
		.trim();
}

const runEditAgentStep = createStep({
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

const runGenerateAgentStep = createStep({
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

export const editorCommandWorkflow = createWorkflow({
	id: 'editorCommandWorkflow',
	description: 'Resolves editor context and mentions, then executes edit or generate agents with streaming',
	inputSchema: editorCommandRequestSchema,
	outputSchema: finalizedEditorCommandSchema,
})
	.then(deriveEditorContextStep as any)
	.then(resolveMentionsStep as any)
	.then(resolveCommandStep as any)
	.branch([
		[async ({ inputData }: any) => inputData.toolName === 'edit', runEditAgentStep as any],
		[async ({ inputData }: any) => inputData.toolName === 'generate', runGenerateAgentStep as any],
	] as any)
	.commit();
