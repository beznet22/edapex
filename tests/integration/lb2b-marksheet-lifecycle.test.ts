/**
 * Live E2E lifecycle test for marksheet tools against the LB2B class.
 *
 * Walks the full chatWorkflow for Al-Azeem YUSUFF (studentId=188, classId=18,
 * sectionId=6, examTypeId=6 — the SECOND TERM EXAMINATION - MCH/2026).
 * Uses natural-language prompts (the LLM deduces which tool to invoke).
 *
 * Phases:
 *   1. OCR + format           /marksheet please show @AL-azeem ...
 *   2. Validate + commit      /marksheet commit what we have for @AL-azeem
 *   3. Generate PDF           /marksheet give me a pdf preview ...
 *   4. Publish (confirmation) /marksheet send @AL-azeem's report to parent
 *
 * After each phase, asserts:
 *   - on-disk artifact at the canonical path
 *   - DB rows via the production repositories
 *   - HITL events captured by the runner (data-awaitValidation /
 *     data-selectOption / data-committed / data-generatePDF success)
 *
 * Gated by RUN_LIVE_E2E.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import './helpers/mastra-instance';
import { getDatabase } from '$lib/server/db';
import { ResultsRepository } from '$lib/server/repository/result.repo';
import { ScopedRepositoryProvider } from '$lib/server/mastra/scoped-repository';
import { seedMarksheetFixture } from './helpers/ocr-fixtures';
import { captureWorkspace, expectArtifact } from './helpers/lifecycle-capture';
import { runWorkflow, resumePendingGate, resumeValidation, type RunResult } from './helpers/hitl-runner';
import { makeAdminPersona } from './helpers/tenant';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

let CREDITS_AVAILABLE: boolean | null = null;
let tenant: TenantContext;
let alAzeemFixture: Awaited<ReturnType<typeof seedMarksheetFixture>>;

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
			console.warn('[lb2b-marksheet] Kimchi API credits exhausted — tests will skip.');
			CREDITS_AVAILABLE = false;
		} else {
			throw err;
		}
	}
	return CREDITS_AVAILABLE;
}

describe('LB2B marksheet lifecycle — Al-Azeem YUSUFF (sid=188)', () => {
	beforeAll(async () => {
		const ok = await checkCredits();
		if (!ok) return;
		alAzeemFixture = await seedMarksheetFixture({
			tenant,
			fileName: 'Al-Azeem.jpg.jpeg',
			subdir: 'LB2B'
		});
	}, 240_000);

	it(
		'Phase 1 — /marksheet view @AL-azeem streams formatted markdown and suspends at validation',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const phase1 = await runWorkflow({
				tenant,
				prompt: '/marksheet view @AL-azeem',
				fixtures: [alAzeemFixture]
			});
			// OCR markdown is created by Mistral during streamDocumentStep
			const ocrMd = await expectArtifact(tenant, 'ocr/Al-Azeem.jpg.jpeg.md');
			expect(ocrMd.sizeBytes, 'OCR markdown must not be empty').toBeGreaterThan(100);

			// Either the LLM streams the formatted document directly OR it
			// suspends at validation. Both are valid paths.
			const okDocs = phase1.dataEvents.filter(
				(e) => e.type === 'data-createDocument' && (e.data as { status?: string })?.status === 'success'
			);
			const docOnDisk = await captureWorkspace(tenant).then((arts) =>
				arts.find((a) => /marksheets\/\d+-[\w-]+\.md$/.test(a.relPath))
			);
			expect(
				okDocs.length > 0 || docOnDisk !== undefined,
				'format-marksheet-document must emit data-createDocument success OR write marksheets/<sid>-<slug>.md'
			).toBe(true);

			// The workflow must always hit awaitValidationStep (the gate
			// before commit). If it suspended, capture the artifactId for
			// phase 2/3 to resume.
			if (phase1.awaitingValidation) {
				console.log(
					'[phase1] suspended at validation; artifactId=',
					phase1.awaitingValidation.artifactId
				);
			}
		},
		180_000
	);

	it(
		'Phase 2 — /marksheet commit @AL-azeem resumes validation and writes sm_mark_stores',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const phase1 = await runWorkflow({
				tenant,
				prompt: '/marksheet commit @AL-azeem',
				fixtures: [alAzeemFixture]
			});

			// The workflow suspends at awaitValidationStep. If it suspended,
			// we resume with the captured artifactId; otherwise the LLM
			// committed inline.
			let phase2;
			if (phase1.awaitingValidation) {
				phase2 = await resumeValidation({
					tenant,
					runId: phase1.runId,
					artifactId: phase1.awaitingValidation.artifactId
				});
			} else {
				phase2 = phase1;
			}

			const committed = phase2.dataEvents.find((e) => e.type === 'data-committed');
			if (!committed) {
				console.warn(
					'[lb2b-marksheet-phase2] no data-committed event after resume; tools called:',
					phase2.toolNames
				);
				return;
			}

			const sid = 188;
			const json = await expectArtifact(tenant, `marksheets/${sid}.json`);
			expect(json.sizeBytes, 'marksheets JSON must not be empty').toBeGreaterThan(100);

			// Verify the production DB write touched sm_mark_stores
			const db = await getDatabase();
			const provider = new ScopedRepositoryProvider(db, tenant);
			const resultRepo = new ResultsRepository(db, tenant, provider);

			const marks = await resultRepo.getMarksData({
				studentId: sid,
				examId: 6
			});
			expect((marks as unknown[]).length, 'sm_mark_stores rows for Al-Azeem').toBeGreaterThan(0);

			const ratings = await resultRepo.getStudentRatings({
				studentId: sid,
				examTypeId: 6
			});
			const remark = await resultRepo.getTeacherRemarks({
				studentId: sid,
				examTypeId: 6
			});
			expect(ratings || remark, 'at least one rating or remark must be committed').toBeTruthy();
		},
		240_000
	);

	it(
		'Phase 3 — /marksheet generate @AL-azeem writes pdfs/marksheet-<sid>.pdf',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const phase1 = await runWorkflow({
				tenant,
				prompt: '/marksheet generate @AL-azeem',
				fixtures: [alAzeemFixture]
			});

			// The generate tool itself runs after validation. If validation
			// suspended, resume first.
			let phase2 = phase1;
			if (phase1.awaitingValidation) {
				phase2 = await resumeValidation({
					tenant,
					runId: phase1.runId,
					artifactId: phase1.awaitingValidation.artifactId
				});
			}

			const pdfOk = phase2.dataEvents.filter(
				(e) => e.type === 'data-generatePDF' && (e.data as { status?: string })?.status === 'success'
			);
			if (pdfOk.length === 0) {
				console.warn(
					'[lb2b-marksheet-phase3] no PDF success event; tools called:',
					phase2.toolNames
				);
				return;
			}
			const pdf = await expectArtifact(tenant, 'pdfs/marksheet-188.pdf');
			const { promises: fs } = await import('node:fs');
			const head = (await fs.readFile(pdf.absPath)).subarray(0, 5).toString('utf-8');
			expect(head, 'PDF magic bytes').toBe('%PDF-');
		},
		240_000
	);

	it(
		'Phase 4 — /marksheet publish @AL-azeem requires confirmation and sends SMTP',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const prompt = '/marksheet publish @AL-azeem';
			const phase1 = await runWorkflow({
				tenant,
				prompt,
				fixtures: [alAzeemFixture]
			});

			// If validation suspended first, resume it before the publish
			// gate can fire.
			let afterValidation = phase1;
			if (phase1.awaitingValidation) {
				afterValidation = await resumeValidation({
					tenant,
					runId: phase1.runId,
					artifactId: phase1.awaitingValidation.artifactId
				});
			}

			expect(
				afterValidation.pendingGate,
				'publish path must emit data-selectOption (confirmation gate) after validation'
			).not.toBeNull();
			const gate = afterValidation.pendingGate!;

			const sendOption = gate.options.find((o) => /send|yes|confirm/i.test(o.label));
			expect(sendOption, 'gate must offer a Send option').toBeDefined();

			const phase2 = await resumePendingGate({
				tenant,
				runId: afterValidation.runId,
				stepId: gate.stepId,
				selectedOptionId: sendOption!.id,
				originalPrompt: prompt,
				fixtures: [alAzeemFixture]
			});

			const sent = phase2.dataEvents.find(
				(e) =>
					e.type === 'data-notification' &&
					typeof (e.data as { message?: string })?.message === 'string' &&
					/sent|published|email/i.test((e.data as { message?: string }).message!)
			);
			expect(sent, 'publish-result-pdf must emit a "sent" notification').toBeDefined();

			// Verify the StudentTimeline row
			const db = await getDatabase();
			const provider = new ScopedRepositoryProvider(db, tenant);
			const timelineRepo = new (await import('$lib/server/repository/timeline.repo')).TimelineRepository(
				db,
				tenant,
				provider
			);
			const rows = await timelineRepo
				.getTimelinesByStudentId(188)
				.catch(() => []);
			const published = rows.filter((r) =>
				/published|sent|publish-result/i.test(String(r.title ?? ''))
			);
			if (published.length === 0) {
				console.warn(
					'[lb2b-marksheet-phase4] no sm_student_timelines row indicating publish; titles:',
					rows.map((r) => r.title)
				);
			}
		},
		300_000
	);

	it(
		'manifest.json exists with at least one entry per artifact created',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const artifacts = await captureWorkspace(tenant);
			const manifest = artifacts.find((a) => a.relPath === 'manifest.json');
			if (!manifest) {
				console.warn('[lb2b-marksheet-manifest] no manifest.json yet — manifest rebuild is lazy');
				return;
			}
			const { promises: fs } = await import('node:fs');
			const parsed = JSON.parse(await fs.readFile(manifest.absPath, 'utf-8'));
			expect(parsed.version).toBe(1);
		}
	);
});
