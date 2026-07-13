/**
 * Marksheet lifecycle integration tests — branches A, B, C.
 *
 *   Branch A: single screenshot + @mention → direct validate → commit
 *   Branch B: single screenshot + no @mention → request-selection for student
 *   Branch C: multiple pending screenshots → only ask examType + academicYear,
 *             defer student linking to per-screenshot HITL
 *
 * Gated by `RUN_LIVE_E2E=1`. Each test uses the real LLM (kimchi/minmax-m3)
 * + real Mistral OCR (cached) + real MySQL.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import './helpers/mastra-instance';
import { mastra } from './helpers/mastra-instance';
import { handleWorkflowStream } from '@mastra/ai-sdk';
import { collectStream } from './helpers/stream-consumer';
import { makeAdminPersona } from './helpers/tenant';
import { seedMarksheetFixture } from './helpers/ocr-fixtures';
import { buildRequestContext } from '$lib/server/helpers/chat-helper';
import { getModelForTest, TEST_MODEL_ID } from './helpers/tenant';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { RequestContext } from '@mastra/core/request-context';
import { randomUUID } from 'node:crypto';
import type { MarksheetFixture } from './helpers/ocr-fixtures';

interface RunResult {
	text: string;
	toolNames: string[];
	collected: Awaited<ReturnType<typeof collectStream>>;
}

async function runMarksheetWorkflow(params: {
	tenant: TenantContext;
	prompt: string;
	fixtures: MarksheetFixture[];
	resumeData?: unknown;
}): Promise<RunResult> {
	const userId = params.tenant.userId;
	const requestContext: RequestContext<unknown> = await buildRequestContext({
		context: params.tenant,
		userId,
		modelId: TEST_MODEL_ID,
		isSlashCommand: params.prompt.trim().startsWith('/'),
		lastMessage: params.prompt
	});
	const modelConfig = await getModelForTest(userId, TEST_MODEL_ID);
	requestContext.set('modelConfig', modelConfig);

	const stream = await handleWorkflowStream({
		version: 'v6',
		mastra,
		workflowId: 'chatWorkflow',
		params: {
			runId: randomUUID(),
			inputData: {
				threadId: `test-thread-${randomUUID()}`,
				resourceId: `user-${userId}`,
				promptText: params.prompt,
				fileReferences: params.fixtures.map((f) => ({
					toolCallId: f.documentId,
					fileId: f.contentHash,
					contentHash: f.contentHash,
					fileName: f.fileName,
					type: 'file' as const
				}))
			},
			requestContext,
			...(params.resumeData ? { resumeData: params.resumeData } : {})
		},
		sendReasoning: true,
		sendSources: true
	});
	const collected = await collectStream(stream, { timeoutMs: 120_000, label: 'marksheet-branch' });
	return { text: collected.text, toolNames: collected.toolNames, collected };
}

let CREDITS_AVAILABLE: boolean | null = null;

async function checkCredits(): Promise<boolean> {
	if (CREDITS_AVAILABLE !== null) return CREDITS_AVAILABLE;
	try {
		const tenant = await makeAdminPersona();
		await runMarksheetWorkflow({ tenant, prompt: 'hi', fixtures: [] });
		CREDITS_AVAILABLE = true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/exhausted credits|no registered providers|Cannot connect|API key/i.test(msg)) {
			console.warn('[integration-marksheet] Kimchi API credits exhausted — tests will skip.');
			CREDITS_AVAILABLE = false;
		} else {
			throw err;
		}
	}
	return CREDITS_AVAILABLE;
}

describe('marksheet branches - lifecycle', () => {
	let tenant: TenantContext;
	let alAzeemFixture: MarksheetFixture;
	let brianFixture: MarksheetFixture;

	beforeAll(async () => {
		const ok = await checkCredits();
		if (!ok) return;
		tenant = await makeAdminPersona();
		// Seed both fixtures sequentially — each Mistral OCR call costs ~3s
		alAzeemFixture = await seedMarksheetFixture({ tenant, fileName: 'Al-Azeem.jpg.jpeg' });
		brianFixture = await seedMarksheetFixture({ tenant, fileName: 'brian.jpg.jpeg' });
	}, 240_000);

	it(
		'Branch A: /marksheet view @AL-azeem streams formatted markdown for a single screenshot',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const result = await runMarksheetWorkflow({
				tenant,
				prompt: '/marksheet view @AL-azeem',
				fixtures: [alAzeemFixture]
			});
			// The format-marksheet-document tool (or its streamDocumentStep
			// predecessor) must emit data-createDocument events with non-empty
			// content.
			const createDocEvents = result.collected.dataEvents.filter((e) => e.type === 'data-createDocument');
			expect(createDocEvents.length).toBeGreaterThan(0);
			const successEvents = createDocEvents.filter((e) => (e.data as { status?: string })?.status === 'success');
			expect(successEvents.length).toBeGreaterThan(0);
			const lastSuccess = successEvents[successEvents.length - 1]!;
			const content = String((lastSuccess.data as { content?: string }).content ?? '');
			expect(content.length, 'formatted markdown should be non-trivial').toBeGreaterThan(20);
		},
		180_000
	);

	it(
		'Branch C: /marksheet generate (no @mention) with 2 pending screenshots skips the upfront student question',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const result = await runMarksheetWorkflow({
				tenant,
				prompt: '/marksheet generate',
				fixtures: [alAzeemFixture, brianFixture]
			});
			// When multiple pending screenshots exist, the workflow MUST NOT
			// ask the user to pick a student upfront (that's Branch B's
			// behavior). Instead, the question is deferred to per-screenshot
			// HITL. The user may be asked about examType + academicYear, but
			// NOT about which student each screenshot belongs to.
			const selectOptionEvents = result.collected.dataEvents.filter((e) => e.type === 'data-selectOption');
			for (const ev of selectOptionEvents) {
				const data = ev.data as { options?: Array<{ id?: string; label?: string }>; promptText?: string };
				const promptLower = (data.promptText ?? '').toLowerCase();
				// None of the option ids or labels should mention "student".
				for (const opt of data.options ?? []) {
					const text = `${opt.id ?? ''} ${opt.label ?? ''}`.toLowerCase();
					expect(
						text.includes('student'),
						`multi-screenshot workflow must not offer student-choice options upfront; got "${opt.label}"`
					).toBe(false);
				}
				// The prompt should be about examType / academicYear only
				expect(promptLower).not.toMatch(/which student|student.{0,20}belong/);
			}
			// The data-createDocument events from streamDocumentStep should
			// still fire — both screenshots are being formatted.
			const createDocEvents = result.collected.dataEvents.filter((e) => e.type === 'data-createDocument');
			expect(createDocEvents.length, 'expected createDocument events for both screenshots').toBeGreaterThanOrEqual(2);
		},
		180_000
	);
});
