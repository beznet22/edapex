/**
 * Mastra workflow registry.
 *
 * Each workflow is composed from its step files in `chat/` and `editor/`
 * subdirectories. Step files export individual `createStep(...)` instances;
 * this index stitches them into the top-level `chatWorkflow` and
 * `editorCommandWorkflow` exports consumed by `mastra/index.ts`.
 */

import { createWorkflow } from '@mastra/core/workflows';
import { chatWorkflowInputSchema, chatWorkflowOutputSchema } from '../utils/chat-schemas';
import { editorCommandRequestSchema, finalizedEditorCommandSchema } from '../editor/schemas';

import { classifyAndStreamWorkflow } from './chat/classify-and-stream';
import { titleStep } from './chat/title-step';
import { extractFileItemsStep } from './chat/extract-file-items-step';
import { collapseStep } from './chat/collapse-step';
import { assistantStep } from './chat/assistant-step';

import { deriveEditorContextStep } from './editor/derive-editor-context-step';
import { resolveMentionsStep } from './editor/resolve-mentions-step';
import { resolveCommandStep } from './editor/resolve-command-step';
import { runEditAgentStep } from './editor/run-edit-agent-step';
import { runGenerateAgentStep } from './editor/run-generate-agent-step';
import { stripLeakedSelection } from '../editor/strip-leaked-selection';
import { resolveAgentContextStep } from './chat/resolve-context-step';

// ─── chatWorkflow ─────────────────────────────────────────────────────────

export const chatWorkflow = createWorkflow({
	id: 'chatWorkflow',
	description: 'Per-file OCR streaming + assistant text generation',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: chatWorkflowOutputSchema,
	retryConfig: { attempts: 2, delay: 1000 },
	options: {
		onError: async (errorInfo) => {
			console.error('[chatWorkflow] error', {
				runId: errorInfo.runId,
				workflowId: errorInfo.workflowId,
				status: errorInfo.status,
				error: errorInfo.error
			});
		}
	}
})
	.parallel([classifyAndStreamWorkflow, titleStep])
	.then(extractFileItemsStep)
	.then(collapseStep)
	.then(resolveAgentContextStep)
	.then(assistantStep)
	.commit();


// ─── editorCommandWorkflow ────────────────────────────────────────────────
export const editorCommandWorkflow = createWorkflow({
	id: 'editorCommandWorkflow',
	description: 'Resolves editor context and mentions, then executes edit, continue, or generate agents with streaming',
	inputSchema: editorCommandRequestSchema,
	outputSchema: finalizedEditorCommandSchema,
})
	.then(deriveEditorContextStep as any)
	.then(resolveMentionsStep as any)
	.then(resolveCommandStep as any)
	.branch([
		[async ({ inputData }: any) => ['generate', 'continue'].includes(inputData.toolName), runGenerateAgentStep as any],
		[async ({ inputData }: any) => ['edit', 'improve', 'fix', 'shorter', 'longer'].includes(inputData.toolName), runEditAgentStep as any],
	] as any)
	.commit();
