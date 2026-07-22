/**
 * Auto-Commit Endpoint — EdApex Workspace
 *
 * Receives `{ path, examTypeId, reason? }` from the editor after 8 s of
 * typing silence (see `editor-canvas.svelte`'s commit debounce).
 *
 * First validates the marksheet exactly like the `action=validate` flow:
 *   1. Parse the .md via `parseMarksheetMarkdown` + `buildMarksheetParseContext`.
 *   2. Check admission‑no mismatch against roster.
 *   3. Validate against `marksheetSchema`.
 *   4. Cross‑reference assigned subjects — missing subjects are blocking errors.
 *
 * If validation passes, resolves `studentId` from the validated marksheet,
 * backfills it onto the manifest entry, then calls `commitMarksheetLogic`
 * with `skipJsonWrite: true` so only the MySQL write and manifest update
 * are produced (no canonical `<studentId>.json` or renamed `.md`).
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { resolveTenantWorkspace } from '$lib/server/workspace/scope';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { updateEntry } from '$lib/server/workspace/manifest';
import { marksheetSchema } from '$lib/schema/marksheet';
import { buildMarksheetParseContext } from '$lib/server/mastra/tools/operations/reporting/marksheet/parse-context';
import { commitMarksheetLogic } from '$lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet';
import { crossReferenceSubjects } from '$lib/server/mastra/tools/operations/reporting/marksheet/validate-cross-ref';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { parseMarksheetMarkdown, extractTableField } from '$lib/utils/marksheet-ast-parser';

const bodySchema = z.object({
	path: z.string().regex(/marksheets\/.*\.md$/, 'path must point to a marksheets/*.md file'),
	examTypeId: z.number().int().positive(),
	reason: z.string().optional(),
});

function failResponse(code: string, message: string, path: string, status: number) {
	return json(
		{ ok: false, errors: [{ code, message, path }] },
		{ status }
	);
}

export const POST: RequestHandler = async ({ request, locals, cookies }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const rawBody: unknown = await request.json().catch(() => null);
	const parsedBody = bodySchema.safeParse(rawBody);
	if (!parsedBody.success) {
		return failResponse(
			'BAD_REQUEST',
			`Invalid body: ${parsedBody.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
			'body',
			400
		);
	}
	const { path: manifestRelPath, examTypeId, reason } = parsedBody.data;

	const { tenant, fs } = await resolveTenantWorkspace({
		schoolId: locals.user.schoolId ?? 1,
		userId: locals.user.id ?? 1,
		staffId: (locals.user as { staffId?: number })?.staffId,
		designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
		selectedClassCookie: cookies.get('selected-class'),
		examTypeId,
	});
	if (!fs) throw error(500, 'Workspace filesystem unavailable');

	if (!(await fs.exists(manifestRelPath))) {
		return failResponse(
			'WORKSPACE_FILE_NOT_FOUND',
			`No marksheet file at ${manifestRelPath} (the editor may not have auto-saved yet)`,
			manifestRelPath,
			422
		);
	}

	// ── Validate: matches action='validate' flow exactly ──
	const raw = await fs.readFile(manifestRelPath, { encoding: 'utf-8' });
	const markdown = typeof raw === 'string' ? raw : raw.toString('utf-8');

	let validationErrors: string[] = [];
	let validationWarnings: string[] = [];

	if (manifestRelPath.includes('marksheets/') && manifestRelPath.endsWith('.md')) {
		try {
			const parseContext = await buildMarksheetParseContext(markdown, tenant);
			const parsed = parseMarksheetMarkdown(markdown, parseContext);

			const enteredAdmNo = extractTableField(markdown, 'admission no');
			if (enteredAdmNo && Number(enteredAdmNo) !== parsed.student.adminNo) {
				validationErrors.push(
					`Admission No mismatch: file has ${enteredAdmNo}, but roster records ${parsed.student.adminNo}. The roster value will be used on reload.`
				);
			}

			const result = await marksheetSchema.safeParseAsync(parsed);
			if (!result.success) {
				validationErrors.push(...result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
			}

			if (tenant.classId != null && tenant.sectionId != null && result.success) {
				try {
					const assessment = await createAssessmentServiceForRequest(tenant);
					const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
					const missing = crossReferenceSubjects(result.data, assigned);
					if (missing.length > 0) {
						validationErrors.push(...missing);
					}
				} catch { /* best-effort */ }
			}

			const validateStatus = validationErrors.length > 0 ? 'Failed' : 'Validated';
			await updateEntry(tenant, manifestRelPath, {
				validationErrors,
				validationErrorCount: validationErrors.length,
				validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
				validationWarningCount: validationWarnings.length > 0 ? validationWarnings.length : undefined,
				status: validateStatus,
			}, examTypeId);

			if (validationErrors.length > 0) {
				return failResponse('VALIDATION_FAILED', validationErrors.join('; '), manifestRelPath, 422);
			}

			// result.success is guaranteed true here (would have errors otherwise)
			if (!result.success) {
				return failResponse('VALIDATION_FAILED', 'marksheetSchema rejected the parsed marksheet', manifestRelPath, 422);
			}
			const marksheet = result.data;
			const studentId = marksheet.student.id;
			if (!studentId || studentId <= 0) {
				return failResponse('STUDENT_ID_UNRESOLVED', 'Student ID is invalid in validated marksheet', 'marksheet.student.id', 422);
			}

			// Backfill studentId + admissionNo to manifest so subsequent commits are fast
			const admNo = marksheet.student.adminNo;
			await updateEntry(tenant, manifestRelPath, {
				studentId,
				...(admNo != null ? { admissionNo: Number(admNo) } : {}),
			}, examTypeId).catch(err => console.warn('[commit] manifest backfill failed (non-fatal)', err));

			const commitResult = await commitMarksheetLogic(
				tenant,
				{ studentId, reason: reason ?? 'Auto-commit after idle', marksheet },
				{ skipJsonWrite: true, sourcePath: manifestRelPath }
			);

			if (!commitResult.ok) {
				return json(commitResult, { status: 422 });
			}
			return json(commitResult, { status: 200 });
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return failResponse('PARSE_FAILED', `Failed to parse ${manifestRelPath}: ${message}`, manifestRelPath, 422);
		}
	}

	return failResponse('NOT_A_MARKSHEET', 'path must point to a marksheets/*.md file', manifestRelPath, 400);
};
