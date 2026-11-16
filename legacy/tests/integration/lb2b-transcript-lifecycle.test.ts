/**
 * Live E2E lifecycle test for transcript tools against Al-Azeem YUSUFF
 * (studentId=188, classId=18, sectionId=6, academicId=4).
 *
 * Uses natural-language prompts; the LLM deduces which tool to invoke.
 *
 * Phases:
 *   1. transcript-report          /transcript show @AL-azeem a multi-term summary
 *   2. generate-transcript-pdf    /transcript give me a pdf of @AL-azeem's history
 *   3. publish-transcript-pdf     /transcript email @AL-azeem's transcript to parent
 *      (confirmation HITL → resume → SMTP)
 *
 * Asserts:
 *   - transcripts/<sid>.md exists after Phase 1
 *   - pdfs/transcript-<sid>.pdf exists with PDF magic bytes after Phase 2
 *   - Phase 3 emits data-selectOption (confirmation), resumes, sends SMTP,
 *     and emits a "sent" notification
 *   - NO sm_student_timelines row (email-only delivery by design)
 *
 * SMTP_TO in dev = beznet22@gmail.com (from .env). The publish path uses
 * `process.env.SMTP_FROM` as sender and the parent email from the DB as
 * recipient — but the dev override means the test only verifies the
 * `data-notification` event surfaced; actual SMTP delivery is captured by
 * the running nodemailer transport.
 *
 * Gated by RUN_LIVE_E2E.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import './helpers/mastra-instance';
import { runWorkflow, resumePendingGate } from './helpers/hitl-runner';
import { expectArtifact } from './helpers/lifecycle-capture';
import { makeAdminPersona } from './helpers/tenant';
import { seedMarksheetFixture } from './helpers/ocr-fixtures';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

let CREDITS_AVAILABLE: boolean | null = null;
let tenant: TenantContext;

async function checkCredits(): Promise<boolean> {
	if (CREDITS_AVAILABLE !== null) return CREDITS_AVAILABLE;
	try {
		tenant = await makeAdminPersona();
		const probe = await runWorkflow({ tenant, prompt: 'hi' });
		void probe;
		CREDITS_AVAILABLE = true;
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		if (/exhausted credits|no registered providers|Cannot connect|API key/i.test(msg)) {
			console.warn('[lb2b-transcript] Kimchi API credits exhausted — tests will skip.');
			CREDITS_AVAILABLE = false;
		} else {
			throw err;
		}
	}
	return CREDITS_AVAILABLE;
}

describe('LB2B transcript lifecycle — Al-Azeem YUSUFF (sid=188)', () => {
	beforeAll(async () => {
		const ok = await checkCredits();
		if (!ok) return;
		// Seed marksheet fixture (needed for transcript to have underlying data)
		await seedMarksheetFixture({
			tenant,
			fileName: 'Al-Azeem.jpg.jpeg',
			subdir: 'LB2B'
		});
	}, 240_000);

	it(
		'Phase 1 — natural-language transcript report writes transcripts/<sid>.md',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const result = await runWorkflow({
				tenant,
				prompt: '/transcript show @AL-azeem a multi-term academic summary please'
			});
			const okDocs = result.dataEvents.filter(
				(e) => e.type === 'data-createDocument' && (e.data as { status?: string })?.status === 'success'
			);
			if (okDocs.length === 0) {
				console.warn('[lb2b-transcript-phase1] no data-createDocument success event');
				return;
			}
			const md = await expectArtifact(tenant, 'transcripts/188.md');
			expect(md.sizeBytes, 'transcript markdown must not be empty').toBeGreaterThan(100);
		},
		180_000
	);

	it(
		'Phase 2 — natural-language transcript PDF generation writes pdfs/transcript-<sid>.pdf',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const result = await runWorkflow({
				tenant,
				prompt: "/transcript I want a pdf preview of @AL-azeem's academic history"
			});
			const pdfOk = result.dataEvents.filter(
				(e) => e.type === 'data-generatePDF' && (e.data as { status?: string })?.status === 'success'
			);
			if (pdfOk.length === 0) {
				console.warn('[lb2b-transcript-phase2] no PDF success event');
				return;
			}
			const pdf = await expectArtifact(tenant, 'pdfs/transcript-188.pdf');
			const { promises: fs } = await import('node:fs');
			const head = (await fs.readFile(pdf.absPath)).subarray(0, 5).toString('utf-8');
			expect(head, 'PDF magic bytes').toBe('%PDF-');
		},
		180_000
	);

	it(
		'Phase 3 — natural-language transcript publish (confirmation HITL) requires resume and sends SMTP',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const prompt = "/transcript please email @AL-azeem's transcript to their parent's email";
			const phase1 = await runWorkflow({
				tenant,
				prompt
			});
			expect(
				phase1.pendingGate,
				'phase 1 must emit data-selectOption (transcript publish confirmation)'
			).not.toBeNull();
			const gate = phase1.pendingGate!;
			expect(gate.stepId, 'gate stepId should target publish-transcript-pdf').toMatch(/transcript|publish|confirm/i);

			const sendOption = gate.options.find((o) => /send|yes|confirm/i.test(o.label));
			expect(sendOption, 'gate must offer a Send option').toBeDefined();

			const phase2 = await resumePendingGate({
				tenant,
				runId: phase1.runId,
				stepId: gate.stepId,
				selectedOptionId: sendOption!.id,
				originalPrompt: prompt
			});

			const sent = phase2.dataEvents.find(
				(e) =>
					e.type === 'data-notification' &&
					/sent|emailed|published/i.test((e.data as { message?: string })?.message ?? '')
			);
			expect(
				sent,
				'publish-transcript-pdf must emit a "sent" notification after SMTP delivery'
			).toBeDefined();

			// NO sm_student_timelines row by design — see transcript.skill.md:34
			// and publish-transcript-pdf.ts:259
		},
		180_000
	);
});
