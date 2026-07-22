/**
 * Marksheet auto-commit helper — EdApex Reporting
 *
 * Reads a marksheet markdown from the workspace, parses it through the
 * canonical AST pipeline (`buildMarksheetParseContext` + `parseMarksheetMarkdown`),
 * validates via `marksheetSchema`, and forwards to `commitMarksheetLogic`
 * with `skipJsonWrite: true` so the canonical `marksheets/<studentId>.json`
 * is not produced — only the MySQL write (`AssessmentService.upsertMarksheet`)
 * and the source-path manifest entry update.
 *
 * This is the single source of truth for the "ensure committed before
 * downstream action" step used by:
 *
 *   - `src/routes/api/format-document/+server.ts` after the format agent
 *     generates fresh markdown (synchronous commit so the record exists
 *     in `student_records` before the response returns).
 *
 *   - `src/lib/server/mastra/tools/operations/reporting/generate-result-pdf.ts`
 *     before `assessment.getStudentResult(...)` so the PDF preview EyeIcon
 *     never hits `MARKSHEET_NOT_FOUND` because the marksheet hasn't been
 *     committed yet.
 *
 * Both call sites resolve the canonical `studentId` upstream (from the
 * roster in format-document, from `resolveStudentFromArtifact` /
 * `resolveStudent` in the PDF path); this helper assumes the caller has
 * already done that work and just performs the read-parse-commit pipeline.
 *
 * The helper is best-effort by default: a parse, validation, or commit
 * failure returns `{ ok: false, errors }` rather than throwing, mirroring
 * the format-document precedent. Callers that need to abort the
 * surrounding operation can pass `{ throwOnFailure: true }`.
 *
 * On ANY failure path (missing tenant, missing file, parse error, schema
 * validation error, upsert failure) the helper writes a structured
 * `validationErrors[]` + `validationErrorCount` pair onto the manifest
 * entry for `markdownPath`. The `ArtifactViewer` validation pill reads
 * exactly these two fields to decide whether to render the red error
 * state vs. the green "Valid" state. Without this write, a marksheet
 * that fails in the chat-pipeline path (no editor → no PUT) would
 * silently appear "valid" in the UI until the user clicks EyeIcon and
 * gets a confusing ZodError toast. The write is best-effort: failure to
 * write to the manifest never blocks the helper from returning its
 * error result.
 */
import { marksheetSchema, type Marksheet } from '$lib/schema/marksheet';
import { buildMarksheetParseContext } from './parse-context';
import { parseMarksheetMarkdown } from '$lib/utils/marksheet-ast-parser';
import {
  commitMarksheetLogic,
  type CommitMarksheetOutput,
} from './commit-marksheet';
import { resolveFilesystem } from '../_shared';
import { updateEntry } from '$lib/server/workspace/manifest';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { crossReferenceSubjects, padMissingRecords } from './validate-cross-ref';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

export interface EnsureCommittedInput {
	/** Canonical studentId (already resolved upstream from roster / StudentRepository). */
	studentId: number;
	/** Workspace-relative path to the source markdown file
	 *  (e.g. `exams/examType-<id>/marksheets/<studentId>-<slug>.md`). */
	markdownPath: string;
	/** Human-readable reason used in the commit call + log lines. */
	reason: string;
}

export interface EnsureCommittedOptions {
	/** When true, throw on parse/validation/commit failure instead of
	 *  returning `{ ok: false }`. Use this when the surrounding action
	 *  has no useful fallback (e.g. blocking a downstream report). */
	throwOnFailure?: boolean;
}

/** Local helper-error shape. Promoted to `Error` only when
 *  `throwOnFailure` is true; otherwise the caller receives the structured
 *  `CommitMarksheetOutput` shape from `commitMarksheetLogic`.
 *
 *  Typed as the failure-only variant of the discriminated union so that
 *  `result.errors[0].message` narrows without an extra type guard. */
type CommitFailure = Extract<CommitMarksheetOutput, { ok: false }>;

function fail(
	code: string,
	message: string,
	path: string,
): CommitFailure {
	return {
		ok: false,
		errors: [{ path, message, code }],
	};
}

/**
 * Write the structured validationErrors[] + validationErrorCount pair onto
 * the manifest entry so the ArtifactViewer pill can show the error state.
 * Failure to write is itself best-effort — logged and swallowed so the
 * helper can always return its CommitMarksheetOutput to the caller.
 */
async function persistValidationErrorsToManifest(
	tenant: TenantContext,
	markdownPath: string,
	issues: ReadonlyArray<{ path: string; message: string; code: string }>,
): Promise<void> {
	if (tenant.examTypeId == null) return;
	try {
		const messages = issues.map((i) => `${i.path}: ${i.message} [${i.code}]`);
		await updateEntry(
			tenant,
			markdownPath,
			{
				validationErrors: messages,
				validationErrorCount: messages.length,
				status: 'Failed',
			},
			tenant.examTypeId,
		);
	} catch (err) {
		if (process.env.NODE_ENV !== 'production') {
			console.warn(
				`[ensureMarksheetCommitted] failed to write validationErrors to manifest for ${markdownPath}:`,
				err instanceof Error ? err.message : err,
			);
		}
	}
}

export async function ensureMarksheetCommitted(
	tenant: TenantContext,
	input: EnsureCommittedInput,
	options: EnsureCommittedOptions = {},
): Promise<CommitMarksheetOutput> {
	const { studentId, markdownPath, reason } = input;
	const throwOnFailure = options.throwOnFailure === true;

	if (tenant.examTypeId == null) {
		const result = fail(
			'EXAM_TYPE_REQUIRED',
			'EXAM_TYPE_REQUIRED: ensureMarksheetCommitted requires an active examTypeId in TenantContext',
			'tenant.examTypeId',
		);
		await persistValidationErrorsToManifest(tenant, markdownPath, result.errors);
		if (throwOnFailure) throw new Error(result.errors[0].message);
		return result;
	}

	const fs = await resolveFilesystem(tenant);

	if (!(await fs.exists(markdownPath))) {
		const result = fail(
			'MARKSHEET_FILE_NOT_FOUND',
			`MARKSHEET_FILE_NOT_FOUND: no marksheet markdown at ${markdownPath}`,
			markdownPath,
		);
		await persistValidationErrorsToManifest(tenant, markdownPath, result.errors);
		if (throwOnFailure) throw new Error(result.errors[0].message);
		return result;
	}

	let parsedMarksheet: Marksheet;
	let crossRefWarnings: string[] = [];
	try {
		const raw = await fs.readFile(markdownPath, { encoding: 'utf-8' });
		const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
		const parseContext = await buildMarksheetParseContext(text, tenant);
		const parsed = parseMarksheetMarkdown(text, parseContext);
		const validated = await marksheetSchema.parseAsync(parsed);

		// Pad missing subjects before commit so all assigned subjects have DB records
		if (tenant.classId != null && tenant.sectionId != null) {
			try {
				const assessment = await createAssessmentServiceForRequest(tenant);
				const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
				crossRefWarnings = crossReferenceSubjects(validated, assigned);
				parsedMarksheet = padMissingRecords(validated, assigned);
			} catch {
				parsedMarksheet = validated;
			}
		} else {
			parsedMarksheet = validated;
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const code =
			err instanceof Error && err.name === 'ZodError' ? 'MARKSHEET_INVALID' : 'PARSE_FAILED';
		const result = fail(code, `${code}: ${message}`, markdownPath);
		await persistValidationErrorsToManifest(tenant, markdownPath, result.errors);
		if (throwOnFailure) throw new Error(message);
		return result;
	}

	// Persist cross-reference warnings on manifest entry
	if (crossRefWarnings.length > 0 && tenant.examTypeId != null) {
		try {
			await updateEntry(tenant, markdownPath, {
				validationWarnings: crossRefWarnings,
				validationWarningCount: crossRefWarnings.length,
			}, tenant.examTypeId);
		} catch { /* best-effort */ }
	}

	const result = await commitMarksheetLogic(
		tenant,
		{ studentId, reason, marksheet: parsedMarksheet },
		{ skipJsonWrite: true, sourcePath: markdownPath },
	);

	if (!result.ok) {
		await persistValidationErrorsToManifest(tenant, markdownPath, result.errors);
		if (throwOnFailure) {
			const firstError = result.errors[0];
			throw new Error(`${firstError.code}: ${firstError.message}`);
		}
	}

	return result;
}
