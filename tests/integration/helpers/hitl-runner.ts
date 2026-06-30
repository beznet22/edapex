/**
 * Headless HITL runner for live E2E tests.
 *
 * Replays the same payload shape the production /api/chat route sends so
 * tests exercise the workflow's actual suspend/resume path. The first
 * call invokes the workflow with `runId` only; if the workflow suspends
 * (validation HITL) or emits a `data-selectOption` (confirmation HITL)
 * the runner captures the relevant state, and the second call resumes
 * it via `step` + `resumeData`.
 *
 * Three HITLs are supported:
 *   1. Year/ExamType gate (`selectionGate` step) — emitted as
 *      `data-selectOption` with `stepId: 'selectionGate'`. Resumed with
 *      `{ selectedOptionId: '<examTypeId>' }`.
 *   2. Validation gate (`awaitValidationStep`) — emitted as
 *      `data-awaitValidation`. Resumed with
 *      `{ step: 'awaitValidation', resumeData: { artifactId } }`.
 *   3. Publish confirmation (`publish-result-pdf` / `publish-transcript-pdf`)
 *      — emitted as `data-selectOption` with `stepId: 'publishPdfConfirm'`
 *      or `'transcriptPublishConfirm'`. The tool stores the
 *      `ResultConfirmState` in requestContext; resumed by calling the
 *      same tool again with `confirmed: true, confirmationToken: <token>`.
 */
import { handleWorkflowStream } from '@mastra/ai-sdk';
import { randomUUID } from 'node:crypto';
import { mastra } from './mastra-instance';
import { buildRequestContext } from '$lib/server/helpers/chat-helper';
import { getModelForTest, TEST_MODEL_ID } from './tenant';
import { collectStream } from './stream-consumer';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { RequestContext } from '@mastra/core/request-context';
import type { RequestContextValues } from '$lib/server/mastra/agents';
import type { MarksheetFixture } from './ocr-fixtures';

export interface RunParams {
	tenant: TenantContext;
	prompt: string;
	fixtures?: MarksheetFixture[];
	/** Pre-generated runId; if omitted a new one is minted. Re-use for resume. */
	runId?: string;
	/** Resume: target step name (e.g. 'awaitValidation' or 'selectionGate'). */
	step?: string;
	/** Resume: payload for the suspended step. */
	resumeData?: Record<string, unknown>;
	/** Hard timeout in ms for this single run. */
	timeoutMs?: number;
}

export interface PendingGate {
	runId: string;
	stepId: string;
	options: Array<{ id: string; label: string; icon?: string }>;
	promptText: string;
}

export interface AwaitingValidation {
	artifactId: string;
	runId: string;
}

export interface RunResult {
	runId: string;
	stream: Awaited<ReturnType<typeof collectStream>>;
	text: string;
	toolNames: string[];
	dataEvents: Array<{ type: string; id?: string; data?: unknown }>;
	pendingGate: PendingGate | null;
	awaitingValidation: AwaitingValidation | null;
}

async function buildRunContext(tenant: TenantContext): Promise<RequestContext<RequestContextValues>> {
	const userId = tenant.userId;
	const modelConfig = await getModelForTest(userId, TEST_MODEL_ID);
	const ctx: RequestContext<RequestContextValues> = await buildRequestContext({
		context: tenant,
		userId,
		modelId: TEST_MODEL_ID,
		isSlashCommand: false,
		lastMessage: ''
	});
	ctx.set('modelConfig', modelConfig);
	return ctx;
}

/**
 * Invoke the chatWorkflow with the given params (or resume a prior run).
 * Returns the full event stream + extracted HITL gates.
 */
export async function runWorkflow(params: RunParams): Promise<RunResult> {
	const userId = params.tenant.userId;
	const requestContext: RequestContext<RequestContextValues> = await buildRequestContext({
		context: params.tenant,
		userId,
		modelId: TEST_MODEL_ID,
		isSlashCommand: params.prompt.trim().startsWith('/'),
		lastMessage: params.prompt
	});
	const modelConfig = await getModelForTest(userId, TEST_MODEL_ID);
	requestContext.set('modelConfig', modelConfig);

	const runId = params.runId ?? randomUUID();
	const stream = await handleWorkflowStream({
		version: 'v6',
		mastra,
		workflowId: 'chatWorkflow',
		params: {
			runId,
			...(params.step ? { step: params.step } : {}),
			...(params.resumeData ? { resumeData: params.resumeData } : {}),
			inputData: {
				threadId: `test-thread-${runId}`,
				resourceId: `user-${userId}`,
				promptText: params.prompt,
				fileReferences: (params.fixtures ?? []).map((f) => ({
					toolCallId: f.documentId,
					fileId: f.contentHash,
					contentHash: f.contentHash,
					fileName: f.fileName,
					type: 'file' as const
				}))
			},
			requestContext
		},
		sendReasoning: true,
		sendSources: true
	});
	const collected = await collectStream(stream, {
		timeoutMs: params.timeoutMs ?? 120_000,
		label: `hitl-${params.step ?? 'phase1'}`
	});

	let pendingGate: PendingGate | null = null;
	let awaitingValidation: AwaitingValidation | null = null;
	for (const ev of collected.dataEvents) {
		if (ev.type === 'data-selectOption') {
			const data = ev.data as
				| { options?: Array<{ id?: string; label?: string; icon?: string }>; promptText?: string; runId?: string; stepId?: string }
				| undefined;
			if (data?.options && data.promptText && data.runId && data.stepId) {
				pendingGate = {
					runId: data.runId,
					stepId: data.stepId,
					options: data.options
						.filter((o): o is { id: string; label: string; icon?: string } => Boolean(o.id) && Boolean(o.label))
						.map((o) => ({ id: o.id!, label: o.label!, icon: o.icon })),
					promptText: data.promptText
				};
			}
		} else if (ev.type === 'data-awaitValidation') {
			const data = ev.data as { artifactId?: string; runId?: string } | undefined;
			if (data?.artifactId) {
				awaitingValidation = { artifactId: data.artifactId, runId: data.runId ?? runId };
			}
		}
	}

	return {
		runId,
		stream: collected,
		text: collected.text,
		toolNames: collected.toolNames,
		dataEvents: collected.dataEvents as Array<{ type: string; id?: string; data?: unknown }>,
		pendingGate,
		awaitingValidation
	};
}

/**
 * Resume the workflow's validation suspend. The production client sends
 * `{ step: 'awaitValidation', resumeData: { artifactId } }`.
 */
export async function resumeValidation(params: {
	tenant: TenantContext;
	runId: string;
	artifactId: string;
	timeoutMs?: number;
}): Promise<RunResult> {
	return runWorkflow({
		tenant: params.tenant,
		prompt: '',
		runId: params.runId,
		step: 'awaitValidation',
		resumeData: { artifactId: params.artifactId },
		timeoutMs: params.timeoutMs ?? 120_000
	});
}

/**
 * Resume the workflow's confirmation gate (publish step). Mirrors the
 * production client: sends the same prompt with `runId` + `stepId` +
 * `resumeData: { selectedOptionId, freeTextAnswer? }`.
 */
export async function resumePendingGate(params: {
	tenant: TenantContext;
	runId: string;
	stepId: string;
	selectedOptionId: string;
	freeTextAnswer?: string;
	originalPrompt?: string;
	fixtures?: MarksheetFixture[];
	timeoutMs?: number;
}): Promise<RunResult> {
	return runWorkflow({
		tenant: params.tenant,
		prompt: params.originalPrompt ?? '',
		runId: params.runId,
		step: params.stepId,
		resumeData: {
			selectedOptionId: params.selectedOptionId,
			...(params.freeTextAnswer ? { freeTextAnswer: params.freeTextAnswer } : {})
		},
		fixtures: params.fixtures,
		timeoutMs: params.timeoutMs ?? 120_000
	});
}
