/**
 * Auto-Commit Endpoint — EdApex Workspace
 *
 * Receives `{ path, examTypeId, reason? }` from the editor after 8 s of
 * typing silence (see `editor-canvas.svelte`'s commit debounce). Resolves
 * the marksheet's student identity from the manifest (with `.raw.json`
 * sidecar + re-parse fallbacks), validates the parsed JSON against
 * `marksheetSchema`, and forwards to `commitMarksheetLogic` with
 * `skipJsonWrite: true` so the canonical `<studentId>.json` and renamed
 * `<studentId>-<slug>.md` are not produced — only the MySQL write
 * (`AssessmentService.upsertMarksheet`) and the manifest entry update.
 *
 * Resolution cascade (in order):
 *   1. `entries[path].studentId` from the per-exam manifest (set by
 *      `stream-document` after the first format run).
 *   2. `entries[path].admissionNo` + `StudentRepository.getStudentById(..., true)`
 *      to resolve the studentId.
 *   3. Sibling `<path>.raw.json` sidecar written by the editor's PUT.
 *   4. Re-parse the .md via `parseMarksheetMarkdown` + the lifted
 *      `buildMarksheetParseContext`.
 *   5. Hard fail with `STUDENT_ID_UNRESOLVED` if all four miss.
 *
 * Steps 3 and 4 backfill the resolved `studentId` + `admissionNo` onto
 * the manifest entry so subsequent commits are manifest-fast.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { resolveTenantWorkspace } from '$lib/server/workspace/scope';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';
import { readManifest, updateEntry } from '$lib/server/workspace/manifest';
import { marksheetSchema, type Marksheet } from '$lib/schema/marksheet';
import { buildMarksheetParseContext } from '$lib/server/mastra/tools/operations/reporting/marksheet/parse-context';
import { commitMarksheetLogic } from '$lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet';
import { crossReferenceSubjects, padMissingRecords } from '$lib/server/mastra/tools/operations/reporting/marksheet/validate-cross-ref';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { StudentRepository } from '$lib/server/repository';
import { getDatabase } from '$lib/server/db';
import { parseMarksheetMarkdown } from '$lib/utils/marksheet-ast-parser';

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

	const manifest = await readManifest(tenant, examTypeId);
	const manifestEntry = manifest.entries[manifestRelPath];

	let studentId: number | null = manifestEntry?.studentId ?? null;
	let resolvedAdmissionNo: number | null =
		manifestEntry?.admissionNo != null ? Number(manifestEntry.admissionNo) : null;

	let parsedMarksheet: Marksheet | null = null;
	let backfill: { studentId: number; admissionNo: number | null } | null = null;

	if (studentId == null && resolvedAdmissionNo != null) {
		try {
			const db = await getDatabase();
			const repo = await StudentRepository.build(db, tenant);
			const student = await repo.getStudentById(resolvedAdmissionNo, true);
			if (student?.studentId) {
				studentId = student.studentId;
				backfill = { studentId, admissionNo: resolvedAdmissionNo };
			}
		} catch (err) {
			console.warn('[commit] StudentRepository lookup failed', err);
		}
	}

	const rawJsonPath = manifestRelPath.replace(/\.md$/, '.raw.json');
	if (parsedMarksheet == null && (await fs.exists(rawJsonPath))) {
		try {
			const raw = await fs.readFile(rawJsonPath, { encoding: 'utf-8' });
			const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
			const candidate = JSON.parse(text) as unknown;
			const result = await marksheetSchema.safeParseAsync(candidate);
			if (result.success) {
				parsedMarksheet = result.data;
				if (studentId == null) {
					const idFromJson = parsedMarksheet.student?.id;
					if (typeof idFromJson === 'number' && idFromJson > 0) {
						studentId = idFromJson;
						const adm =
							parsedMarksheet.student?.adminNo != null
								? Number(parsedMarksheet.student.adminNo)
								: null;
						resolvedAdmissionNo = adm;
						backfill = { studentId, admissionNo: adm };
					}
				}
			} else {
				console.warn('[commit] .raw.json failed schema validation; will re-parse .md', {
					issues: result.error.issues.map((i) => i.message),
				});
			}
		} catch (err) {
			console.warn('[commit] failed to read/parse .raw.json sidecar; will re-parse .md', err);
		}
	}

	if (parsedMarksheet == null) {
		try {
			const raw = await fs.readFile(manifestRelPath, { encoding: 'utf-8' });
			const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
			const parseContext = await buildMarksheetParseContext(text, tenant);
			const parsed = parseMarksheetMarkdown(text, parseContext) as unknown;
			const result = await marksheetSchema.safeParseAsync(parsed);
			if (!result.success) {
				return failResponse(
					'MARKSHEET_INVALID',
					`marksheetSchema rejected the .md: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
					manifestRelPath,
					422
				);
			}
			parsedMarksheet = result.data;
			if (studentId == null) {
				const idFromParse = parsedMarksheet.student?.id;
				if (typeof idFromParse === 'number' && idFromParse > 0) {
					studentId = idFromParse;
					const adm =
						parsedMarksheet.student?.adminNo != null
							? Number(parsedMarksheet.student.adminNo)
							: null;
					resolvedAdmissionNo = adm;
					backfill = { studentId, admissionNo: adm };
				}
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			return failResponse(
				'PARSE_FAILED',
				`Failed to re-parse ${manifestRelPath}: ${message}`,
				manifestRelPath,
				422
			);
		}
	}

	if (studentId == null || parsedMarksheet == null) {
		return failResponse(
			'STUDENT_ID_UNRESOLVED',
			`Could not resolve a studentId for ${manifestRelPath} (manifest, .raw.json, and re-parse all failed)`,
			'manifest.studentId',
			422
		);
	}

	if (backfill) {
		try {
			await updateEntry(
				tenant,
				manifestRelPath,
				{
					studentId: backfill.studentId,
					...(backfill.admissionNo != null ? { admissionNo: backfill.admissionNo } : {}),
				},
				examTypeId
			);
		} catch (err) {
			console.warn('[commit] manifest backfill failed (non-fatal)', err);
		}
	}

	// Pad missing subjects so all assigned subjects have DB records
	// and compute cross-reference warnings
	const commitMarksheet = parsedMarksheet;
	let crossRefWarnings: string[] = [];
	if (tenant.classId != null && tenant.sectionId != null) {
		try {
			const assessment = await createAssessmentServiceForRequest(tenant);
			const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
			crossRefWarnings = crossReferenceSubjects(commitMarksheet, assigned);
			parsedMarksheet = padMissingRecords(commitMarksheet, assigned);
		} catch { /* best-effort */ }
	}
	if (crossRefWarnings.length > 0) {
		try {
			await updateEntry(tenant, manifestRelPath, {
				validationWarnings: crossRefWarnings,
				validationWarningCount: crossRefWarnings.length,
			}, examTypeId);
		} catch { /* best-effort */ }
	}

	const result = await commitMarksheetLogic(
		tenant,
		{
			studentId,
			reason: reason ?? 'Auto-commit after idle',
			marksheet: parsedMarksheet,
		},
		{ skipJsonWrite: true, sourcePath: manifestRelPath }
	);

	if (!result.ok) {
		return json(result, { status: 422 });
	}
	return json(result, { status: 200 });
};
