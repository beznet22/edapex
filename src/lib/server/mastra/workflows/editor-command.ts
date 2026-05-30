/**
 * Editor Command Workflow — EdApex
 *
 * Resolves editor context and executes edit or generate agents with streaming.
 * Ported from basic-ai-editor/mastra/workflows/editor-command-workflow.ts:
 * - Removed PlateJS dependencies (createEditorFromRequest, isMultiBlocks)
 * - Context derivation uses plain markdown strings with selection detection
 * - Uses agent.stream() + writer.pipeTo() for real-time token streaming
 */
import { createWorkflow, createStep } from '@mastra/core/workflows';
import {
	buildEditPrompt,
	buildGeneratePrompt,
} from '../editor/prompt-builders';
import {
	editorCommandRequestSchema,
	derivedEditorCommandSchema,
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

const resolveCommandStep = createStep({
	id: 'resolve-command',
	inputSchema: derivedEditorCommandSchema,
	outputSchema: resolvedEditorCommandSchema,
	execute: async ({ inputData }) => {
		const prompt =
			inputData.toolName === 'edit'
				? buildEditPrompt(inputData as any)
				: buildGeneratePrompt(inputData as any);

		return {
			...inputData,
			prompt,
		};
	},
});

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
		const stream = await agent.stream(inputData.prompt, {
			abortSignal,
			modelSettings: { temperature: 0.2 },
			requestContext,
		});

		await stream.fullStream.pipeTo(writer);

		return {
			branch: 'edit' as const,
			text: await stream.text,
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
		const stream = await agent.stream(inputData.prompt, {
			abortSignal,
			modelSettings: { temperature: 0.4 },
			requestContext,
		});

		await stream.fullStream.pipeTo(writer);

		return {
			branch: 'generate' as const,
			text: await stream.text,
		};
	},
});

export const editorCommandWorkflow = createWorkflow({
	id: 'editorCommandWorkflow',
	description: 'Resolves editor context and executes edit or generate agents with streaming',
	inputSchema: editorCommandRequestSchema,
	outputSchema: finalizedEditorCommandSchema,
})
	.then(deriveEditorContextStep as any)
	.then(resolveCommandStep as any)
	.branch([
		[async ({ inputData }: any) => inputData.toolName === 'edit', runEditAgentStep as any],
		[async ({ inputData }: any) => inputData.toolName === 'generate', runGenerateAgentStep as any],
	] as any)
	.commit();
