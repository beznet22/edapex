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
import { hitlVerifyStep } from './chat/hitl-verify-step';
import { assistantStep } from './chat/assistant-step';
import { selectionGateStep } from './chat/selection-gate-step';
import { continuationAssistantStep } from './chat/continuation-assistant-step';
import { awaitValidationStep } from './chat/await-validation-step';

import { deriveEditorContextStep } from './editor/derive-editor-context-step';
import { resolveMentionsStep } from './editor/resolve-mentions-step';
import { resolveCommandStep } from './editor/resolve-command-step';
import { runEditAgentStep } from './editor/run-edit-agent-step';
import { runGenerateAgentStep } from './editor/run-generate-agent-step';
import { stripLeakedSelection } from '../editor/strip-leaked-selection';

// ─── chatWorkflow ─────────────────────────────────────────────────────────

export const chatWorkflow = createWorkflow({
	id: 'chatWorkflow',
	description: 'Per-file OCR streaming + assistant text generation',
	inputSchema: chatWorkflowInputSchema,
	outputSchema: chatWorkflowOutputSchema,
	retryConfig: {
		attempts: 2,
		delay: 1000
	},
	options: {
		onFinish: async (result) => {
			if (result.status === 'failed') {
				console.error('[chatWorkflow] failed', {
					runId: result.runId,
					workflowId: result.workflowId,
					error: result.error
				});
				return;
			}
			if (result.status === 'success') {
				console.info('[chatWorkflow] completed', {
					runId: result.runId,
					workflowId: result.workflowId,
					fileCount: result.result?.resolvedFiles?.length ?? 0,
					textLength: result.result?.text?.length ?? 0
				});
			}

			if (result.status === 'suspended') {
				console.info('[chatWorkflow] suspended', {
					runId: result.runId,
					workflowId: result.workflowId,
					reason: 'Human In The Loop Verification Required'
				});
			}
		},
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
	.then(hitlVerifyStep)
	.then(assistantStep)
	.then(selectionGateStep)
	.then(continuationAssistantStep)
	.then(awaitValidationStep)
	.commit();

/**
 * Sentinel exports for the resume route — the resume endpoint keys its
 * `step:` argument off these ids so the workflow ID and step ID stay in sync.
 */
export const HITL_VERIFY_STEP_ID = hitlVerifyStep.id as 'hitl-verify';

export const SELECTION_GATE_STEP_ID = selectionGateStep.id as 'selectionGate';

export const AWAIT_VALIDATION_STEP_ID = awaitValidationStep.id as 'awaitValidation';

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
		[async ({ inputData }: any) => inputData.toolName === 'generate', runGenerateAgentStep as any],
		[async ({ inputData }: any) => ['edit', 'improve', 'fix', 'shorter', 'longer'].includes(inputData.toolName), runEditAgentStep as any],
	] as any)
	.commit();
