/**
 * Mastra workflow registry.
 *
 * Each workflow is composed from its step files in `chat/` and `editor/`
 * subdirectories. Step files export individual `createStep(...)` instances;
 * this index stitches them into the top-level `chatWorkflow` and
 * `editorCommandWorkflow` exports consumed by `mastra/index.ts`.
 */

import { createWorkflow } from '@mastra/core/workflows';
import {
	AGENT_LOOP_MAX_ITERATIONS,
	chatWorkflowInputSchema,
	chatWorkflowOutputSchema
} from '../utils/chat-schemas';
import { editorCommandRequestSchema, finalizedEditorCommandSchema } from '../editor/schemas';

import { classifyAndStreamWorkflow } from './chat/classify-and-stream';
import { titleStep } from './chat/title-step';
import { extractFileItemsStep } from './chat/extract-file-items-step';
import { collapseStep } from './chat/collapse-step';
import { hitlVerifyStep } from './chat/hitl-verify-step';
import { agentLoopStep } from './chat/agent-loop-step';
import { passthroughStep } from './chat/passthrough-step';
import { awaitValidationStep } from './chat/await-validation-step';
import { seedAgentLoopStep } from './chat/seed-agent-loop-step';
import { seedBranchInputStep } from './chat/seed-branch-input-step';

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
	// Map the workflow envelope to the agent-loop input shape. Replaces a
	// `.map()` step (see seedAgentLoopStep's header) because the internal
	// mapping step's `z.any()` schema silently forwards `undefined` fields
	// downstream, surfacing as `WORKFLOW_STEP_INPUT_VALIDATION_FAILED` at
	// the agent-loop step instead of a clear error at the seam.
	.then(seedAgentLoopStep)
	.dountil(
		agentLoopStep,
		async ({ inputData, iterationCount }) => {
			// Abort if the agent never signals done — guards against runaway
			// loops (e.g. a misbehaving tool call that always triggers another
			// round).
			if (iterationCount >= AGENT_LOOP_MAX_ITERATIONS) {
				throw new Error(
					`AGENT_LOOP_EXHAUSTED: agent did not converge within ${AGENT_LOOP_MAX_ITERATIONS} iterations`,
				);
			}
			return inputData.status === 'done';
		},
	)
	// Project the agent-loop output into the shared branch-input shape
	// ({ text, resolvedFiles }) so both `awaitValidationStep` and
	// `passthroughStep` can consume it. Replaces a `.map()` step for the
	// same reason as `seedAgentLoopStep`.
	.then(seedBranchInputStep)
	.branch([
		// Validation path: only when a marksheet was formatted in this turn.
		// The step itself (after Task 2.2) also gates on these context keys,
		// but the branch lets us skip the step entirely and pass through
		// cheaply for non-validation turns.
		[
			async ({ requestContext }) => {
				const lastFormattedId = requestContext?.get('lastFormattedDocumentId') as
					| string
					| undefined;
				const formatState = requestContext?.get('formatArtifactState') as
					| { persistPath?: string }
					| undefined;
				return Boolean(lastFormattedId) || Boolean(formatState?.persistPath);
			},
			awaitValidationStep
		],
		// No-op path: every other turn terminates here without emitting or
		// suspending. The composer returns to its idle state.
		[async () => true, passthroughStep]
	])
	.commit();

/**
 * Sentinel exports for the resume route — the resume endpoint keys its
 * `step:` argument off these ids so the workflow ID and step ID stay in sync.
 */
export const HITL_VERIFY_STEP_ID = hitlVerifyStep.id as 'hitl-verify';

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
