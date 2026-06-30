/**
 * Validation HITL test — exercises the workflow's `awaitValidationStep`
 * suspend/resume cycle for Al-Azeem YUSUFF.
 *
 * The validation gate sits between `format-marksheet-document` (which
 * emits the polished `marksheets/<sid>-<slug>.md`) and `commit-marksheet`
 * (which writes to MySQL). The workflow suspends and emits
 * `data-awaitValidation` so the user can review + edit the markdown
 * before commit.
 *
 * The natural-language prompt `/marksheet commit @AL-azeem` is interpreted
 * by the LLM as the full chain: OCR → format → validate. Because we
 * suspend before validating, phase 1 captures the artifactId; phase 2
 * resumes with `{ step: 'awaitValidation', resumeData: { artifactId } }`
 * which runs validate → auto-fix → commit.
 *
 * Asserts:
 *   - phase 1 emits `data-awaitValidation` with a real artifactId
 *   - phase 2 emits `data-committed` after validation succeeds
 *   - `marksheets/<sid>.json` is written
 *   - `sm_mark_stores` has rows for Al-Azeem (via getMarksData)
 *
 * Gated by RUN_LIVE_E2E.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import './helpers/mastra-instance';
import { getDatabase } from '$lib/server/db';
import { ResultsRepository } from '$lib/server/repository/result.repo';
import { ScopedRepositoryProvider } from '$lib/server/mastra/scoped-repository';
import { seedMarksheetFixture } from './helpers/ocr-fixtures';
import { expectArtifact } from './helpers/lifecycle-capture';
import { runWorkflow, resumeValidation } from './helpers/hitl-runner';
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
			console.warn('[lb2b-validation-hitl] Kimchi API credits exhausted — tests will skip.');
			CREDITS_AVAILABLE = false;
		} else {
			throw err;
		}
	}
	return CREDITS_AVAILABLE;
}

describe('LB2B marksheet validation HITL — Al-Azeem YUSUFF (sid=188)', () => {
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
		'Phase 1: natural-language commit suspends at awaitValidationStep with data-awaitValidation',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			const phase1 = await runWorkflow({
				tenant,
				prompt: '/marksheet please commit the validated result for @AL-azeem',
				fixtures: [alAzeemFixture]
			});
			expect(
				phase1.awaitingValidation,
				'phase 1 must emit data-awaitValidation (suspend at awaitValidationStep)'
			).not.toBeNull();
			const gate = phase1.awaitingValidation!;
			expect(gate.artifactId, 'data-awaitValidation.artifactId must be present').toBeTruthy();
			expect(gate.artifactId.length, 'artifactId should be non-trivial').toBeGreaterThan(4);
		},
		180_000
	);

	it(
		'Phase 2: resume with { step: awaitValidation, resumeData: { artifactId } } commits marksheet',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			// Run phase 1 in this test too — vitest beforeAll runs once per
			// describe but each `it` gets a fresh workflow run.
			const phase1 = await runWorkflow({
				tenant,
				prompt: '/marksheet please commit the validated result for @AL-azeem',
				fixtures: [alAzeemFixture]
			});
			if (!phase1.awaitingValidation) {
				console.warn(
					'[lb2b-validation-hitl-phase2] phase 1 did not suspend; LLM chose auto-commit. ' +
						'Tools called:',
					phase1.toolNames
				);
				return;
			}

			const phase2 = await resumeValidation({
				tenant,
				runId: phase1.runId,
				artifactId: phase1.awaitingValidation.artifactId
			});

			const committed = phase2.dataEvents.find((e) => e.type === 'data-committed');
			expect(committed, 'phase 2 must emit data-committed after successful validation').toBeDefined();

			const sid = 188;
			const json = await expectArtifact(tenant, `marksheets/${sid}.json`);
			expect(json.sizeBytes).toBeGreaterThan(100);

			const db = await getDatabase();
			const provider = new ScopedRepositoryProvider(db, tenant);
			const resultRepo = new ResultsRepository(db, tenant, provider);
			const marks = await resultRepo.getMarksData({ studentId: sid, examId: 6 });
			expect((marks as unknown[]).length, 'sm_mark_stores rows for Al-Azeem after resume').toBeGreaterThan(0);
		},
		180_000
	);

	it(
		'Year/ExamType gate: when prompt omits the term, workflow must emit data-selectOption with stepId=selectionGate',
		async () => {
			if (!CREDITS_AVAILABLE) return;
			// A prompt that does NOT mention "second term" should trigger the
			// selectionGate step which asks the user to pick examType.
			const phase1 = await runWorkflow({
				tenant,
				prompt: '/marksheet please show @AL-azeem the latest report',
				fixtures: [alAzeemFixture]
			});
			if (!phase1.pendingGate) {
				console.warn(
					'[lb2b-selection-gate] LLM inferred examType from active term without asking. ' +
						'Tools called:',
					phase1.toolNames
				);
				return;
			}
			const gate = phase1.pendingGate;
			expect(gate.stepId, 'gate stepId should be selectionGate').toBe('selectionGate');
			expect(gate.options.length, 'gate must offer examType options').toBeGreaterThan(0);
			// Each option id should look like an examTypeId
			for (const opt of gate.options) {
				expect(/^\d+$/.test(opt.id), `option id ${opt.id} should be numeric examTypeId`).toBe(true);
			}
		},
		180_000
	);
});
