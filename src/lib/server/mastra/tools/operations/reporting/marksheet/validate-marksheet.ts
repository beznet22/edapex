import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetSchema } from '$lib/schema/marksheet';
import { marksheetJsonPath, marksheetMarkdownPath } from '$lib/server/workspace/paths';
import { addEntry, removeEntry, updateEntryStatus } from '$lib/server/workspace/manifest';
import { resolveMentionsInMarkdown } from '$lib/server/mastra/editor/mention-resolver';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { bridgeToolContext } from '$lib/server/mastra/tools/internal/bridge';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';
import type { RequestContext } from '@mastra/core/request-context';
import type { ResolvedMention } from '$lib/server/mastra/editor/schemas';
import { getDatabase } from '$lib/server/db';
import { smStudents, smParents, smSchools } from '$lib/server/db/sms-schema';

interface MarksheetToolContext {
	requestContext?: {
		get<T = unknown>(key: string): T | undefined;
		set<T = unknown>(key: string, value: T): void;
	};
	writer?: StreamWriterLike;
	abortSignal?: AbortSignal;
}

interface MissingIdField {
	field: 'studentId' | 'examTypeId' | 'academicId';
	source: 'no_mention' | 'mention_unresolved' | 'tenant_unset';
}

interface EffectiveIds {
	studentId: number | null;
	adminNo: number | null;
	studentName: string | null;
	examTypeId: number | null;
	academicId: number | null;
}

function getTenant(ctx: MarksheetToolContext): TenantContext {
	const tenant = ctx.requestContext?.get('tenantContext') as TenantContext | undefined;
	if (!tenant) {
		throw new Error('TENANT_CONTEXT_REQUIRED: marksheet tools require an active tenantContext');
	}
	return tenant;
}

async function resolveTenantFilesystem(tenant: TenantContext): Promise<WorkspaceFilesystem> {
	const requestContext = buildWorkspaceRequestContext(tenant);
	const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
	if (!fs) {
		throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem is not configured');
	}
	return fs;
}

function toNumberOrNull(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		const n = Number(value);
		return Number.isFinite(n) ? n : null;
	}
	return null;
}

function computeEffectiveIds(
	mentions: ResolvedMention[],
	tenant: TenantContext,
	inputStudent: { id: number; fullName: string; admissionNo?: number } | undefined
): EffectiveIds {
	const studentMention = mentions.find((m) => m.category === 'students');
	const academicMention = mentions.find((m) => m.category === 'academic_year');
	const examMention = mentions.find((m) => m.category === 'exam');

	const studentId =
		toNumberOrNull(studentMention?.id) ??
		(inputStudent ? inputStudent.id : null) ??
		tenant.studentId ??
		null;

	return {
		studentId,
		adminNo: studentMention?.admissionNo ? Number(studentMention.admissionNo) : inputStudent?.admissionNo ?? null,
		studentName: studentMention?.studentName ?? inputStudent?.fullName ?? null,
		examTypeId: toNumberOrNull(examMention?.id) ?? tenant.examTypeId ?? null,
		academicId: toNumberOrNull(academicMention?.id) ?? tenant.academicId ?? null
	};
}

function detectMissingIds(
	effective: EffectiveIds,
	mentions: ResolvedMention[],
	hasInputStudent: boolean
): MissingIdField[] {
	const hasStudentMention = mentions.some((m) => m.category === 'students');
	const hasExamMention = mentions.some((m) => m.category === 'exam');
	const hasAcademicMention = mentions.some((m) => m.category === 'academic_year');

	const missing: MissingIdField[] = [];
	if (effective.studentId === null) {
		const source: MissingIdField['source'] = hasStudentMention
			? 'mention_unresolved'
			: hasInputStudent
				? 'tenant_unset'
				: 'no_mention';
		missing.push({ field: 'studentId', source });
	}
	if (effective.examTypeId === null) {
		missing.push({
			field: 'examTypeId',
			source: hasExamMention ? 'mention_unresolved' : 'no_mention'
		});
	}
	if (effective.academicId === null) {
		missing.push({
			field: 'academicId',
			source: hasAcademicMention ? 'mention_unresolved' : 'no_mention'
		});
	}
	return missing;
}

const marksheetErrorSchema = z.object({
	path: z.string(),
	message: z.string(),
	code: z.string()
});

export const validateMarksheetTool = createTool({
	id: 'validate-marksheet',
	description:
		'Read the user-edited marksheet markdown from the workspace, parse it via the markdown AST parser, ' +
		'validate against marksheetSchema, persist the validated JSON to marksheets/<studentId>.json, and write the ' +
		'canonical markdown to marksheets/ADM<adminNo>-<examTypeId>-<studentName>.md. Removes the draft at currentMarkdownPath. ' +
		'No LLM call — pure TS parsing + zod validation.',
	inputSchema: z.object({
		currentMarkdownPath: z
			.string()
			.describe(
				'Workspace-relative path of the editor auto-saved draft (e.g. marksheets/adakole-a1b2c3d4.md). Read at execution time to capture the user\'s edits.'
			),
		student: z
			.object({
				id: z.number().int().positive(),
				fullName: z.string(),
				admissionNo: z.number().int().optional()
			})
			.optional()
			.describe(
				'Resolved student identity from the injected classRoster or tenant context. Ignored if the markdown contains an @student mention.'
			),
		reason: z.string().describe('Human-readable action summary for user approval.'),
		title: z
			.string()
			.optional()
			.describe('Optional display title carried through to the canonical markdown.')
	}),
	requireApproval: true,
	outputSchema: z.discriminatedUnion('ok', [
		z.object({
			ok: z.literal(true),
			json: z.unknown(),
			persistedMarkdownPath: z
				.string()
				.describe(
					'Canonical path the markdown was written to: marksheets/ADM<adminNo>-<examTypeId>-<studentName>.md'
				),
			validatedTitle: z
				.string()
				.describe(
					'Display title derived from the validated JSON: `${student.fullName} — ${examType.title}`.'
				),
			marksheetStatus: z.string().describe('Current lifecycle status: validated.'),
			parentName: z.string().nullable().optional().describe('Parent/guardian name for the linked student.'),
			parentEmail: z.string().nullable().optional().describe('Parent/guardian email for the linked student.')
		}),
		z.object({
			ok: z.literal(false),
			errors: z.array(marksheetErrorSchema),
			unresolvedErrors: z.array(marksheetErrorSchema)
		})
	]),
	execute: async (input, ctx) => {
		const context = (await bridgeToolContext(ctx)) as unknown as MarksheetToolContext;
		const tenant = getTenant(context);

		// Read the authoritative user-edited markdown from disk. The editor
		// panel auto-saves on every keystroke, so this captures any edits the
		// user made after the agent initially read the file. @mention
		// resolution runs against THIS string, so any @mentions the user
		// added in the editor are evaluated at approval time.
		const fs = await resolveTenantFilesystem(tenant);
		if (!(await fs.exists(input.currentMarkdownPath))) {
			throw new Error(
				`WORKSPACE_FILE_NOT_FOUND: ${input.currentMarkdownPath} (the editor may not have auto-saved yet)`
			);
		}
		const rawMarkdown = await fs.readFile(input.currentMarkdownPath, { encoding: 'utf-8' });
		const correctedMarkdown = typeof rawMarkdown === 'string' ? rawMarkdown : rawMarkdown.toString('utf-8');

		// PRE-FLIGHT PIPELINE
		// Resolves @mention IDs from the markdown, computes effective IDs
		// (mentions > input.student > tenant), and detects any missing
		// required IDs. If any are missing, emits a data-selectOption part
		// (which the UI surfaces as an OptionDropdown disambiguation sheet)
		// and seeds `pendingSelection` so the existing selectionGateStep
		// can resume the workflow with the user's choice.

		const requestContext = context.requestContext as RequestContext | undefined;
		const { mentions } = await resolveMentionsInMarkdown(
			correctedMarkdown,
			requestContext,
			undefined
		);

		const effective = computeEffectiveIds(mentions, tenant, input.student);
		const missing = detectMissingIds(effective, mentions, input.student != null);

		if (missing.length > 0) {
			return {
				ok: false as const,
				errors: [],
				unresolvedErrors: missing.map((m) => ({
					path: m.field,
					message: `${m.field.toUpperCase()}_REQUIRED (source=${m.source})`,
					code: 'id_required'
				}))
			};
		}

		// All required IDs resolved. Read raw.json (pre-parsed by editor auto-save).
		const assessment = await createAssessmentServiceForRequest(tenant);
		const mapping = await assessment.getMappingData(
			tenant.staffId,
			tenant.classId ?? undefined,
			tenant.sectionId ?? undefined
		);

		const subjectMap = new Map<string, number>();
		for (const s of mapping.subjects) {
			if (s.subjectCode && s.id != null) {
				subjectMap.set(s.subjectCode.toUpperCase(), s.id);
			}
		}

		const rawJsonPath = input.currentMarkdownPath.replace(/\.md$/, '.raw.json');
		let jsonData: Record<string, unknown>;

		if (await fs.exists(rawJsonPath)) {
			const raw = await fs.readFile(rawJsonPath, { encoding: 'utf-8' });
			jsonData = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf-8'));
		} else {
			// Fallback: parse markdown directly if raw.json doesn't exist yet
			const { parseMarksheetMarkdown } = await import('$lib/utils/marksheet-ast-parser');
			jsonData = parseMarksheetMarkdown(correctedMarkdown) as unknown as Record<string, unknown>;
		}

		// Override resolved IDs onto the parsed data
		if (effective.studentId != null) (jsonData.student as Record<string, unknown>).id = effective.studentId;
		if (effective.adminNo != null) (jsonData.student as Record<string, unknown>).adminNo = effective.adminNo;
		if (effective.studentName != null) (jsonData.student as Record<string, unknown>).fullName = effective.studentName;
		if (effective.examTypeId != null) {
			jsonData.examType = { ...(jsonData.examType as Record<string, unknown> ?? {}), id: effective.examTypeId };
		}
		for (const record of (jsonData.records as Array<Record<string, unknown>>) ?? []) {
			const sid = subjectMap.get(String(record.subjectCode ?? '').toUpperCase());
			record.subjectId = sid ?? 0;
			record.studentId = effective.studentId ?? 0;
		}
		for (const subj of (jsonData.subjects as Array<Record<string, unknown>>) ?? []) {
			const code = String(subj.subjectCode ?? '');
			subj.subjectId = code ? (subjectMap.get(code.toUpperCase()) ?? null) : null;
		}

		// Inject school info, gender, sessionYear from DB (these are removed from agent output)
		const db = await getDatabase();
		const schoolRow = await db
			.select({ schoolName: smSchools.schoolName, email: smSchools.email, phone: smSchools.phone })
			.from(smSchools)
			.where(eq(smSchools.id, tenant.schoolId))
			.limit(1)
			.then((rows) => rows[0] ?? null);
		if (schoolRow) {
			(jsonData.school as Record<string, unknown>).id = tenant.schoolId;
			(jsonData.school as Record<string, unknown>).name = schoolRow.schoolName ?? '';
			(jsonData.school as Record<string, unknown>).email = schoolRow.email ?? '';
			(jsonData.school as Record<string, unknown>).phone = schoolRow.phone ?? '';
		}
		if (effective.studentId != null && !(jsonData.student as Record<string, unknown>).sessionYear) {
			(jsonData.student as Record<string, unknown>).sessionYear = tenant.academicYearTitle ?? '';
		}

		const validationResult = await marksheetSchema.safeParseAsync(jsonData);
		// No LLM fallback — template is structurally sound (auto-fixed browser-side).
		// Zod errors are data-level, surfaced to the user via the report skill loop.

		if (validationResult.success) {
			const finalJson = validationResult.data;
			const examTypeId = finalJson.examType?.id ?? tenant.examTypeId ?? null;
			const jsonPath = marksheetJsonPath(finalJson.student.id, examTypeId);
			await fs.writeFile(jsonPath, JSON.stringify(finalJson, null, 2), {
				recursive: true
			});
			await addEntry(tenant, {
				path: jsonPath,
				kind: 'marksheet-json',
				studentId: finalJson.student.id,
				examTypeId,
				uploadedAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				mimeType: 'application/json'
			});

			const canonicalMarkdownPath = marksheetMarkdownPath({
				studentId: finalJson.student.id,
				adminNo: finalJson.student.adminNo,
				examTypeId,
				studentName: finalJson.student.fullName
			});
			const validatedTitle = `${finalJson.student.fullName} \u2014 ${finalJson.examType?.title ?? 'Exam'}`;

			await fs.writeFile(canonicalMarkdownPath, correctedMarkdown, {
				recursive: true
			});
			await addEntry(tenant, {
				path: canonicalMarkdownPath,
				kind: 'marksheet-markdown',
				documentId: String(finalJson.student.id),
				fileName: canonicalMarkdownPath.split('/').pop(),
				studentId: finalJson.student.id,
				examTypeId,
				uploadedAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				mimeType: 'text/markdown'
			});
			await updateEntryStatus(tenant, jsonPath, 'validated');
			await updateEntryStatus(tenant, canonicalMarkdownPath, 'validated');

			if (input.currentMarkdownPath !== canonicalMarkdownPath) {
				if (await fs.exists(input.currentMarkdownPath)) {
					await fs.deleteFile(input.currentMarkdownPath);
				}
				await removeEntry(tenant, input.currentMarkdownPath);
			}

			const db = await getDatabase();
			const studentRow = await db
				.select({ parentId: smStudents.parentId })
				.from(smStudents)
				.where(eq(smStudents.id, finalJson.student.id))
				.limit(1)
				.then((rows) => rows[0] ?? null);
			let parentName: string | null = null;
			let parentEmail: string | null = null;
			if (studentRow?.parentId != null) {
				const parent = await db
					.select({
						guardiansName: smParents.guardiansName,
						guardiansEmail: smParents.guardiansEmail,
					})
					.from(smParents)
					.where(eq(smParents.id, studentRow.parentId))
					.limit(1)
					.then((rows) => rows[0] ?? null);
				if (parent) {
					parentName = parent.guardiansName;
					parentEmail = parent.guardiansEmail;
				}
			}

			return {
				ok: true as const,
				json: finalJson,
				persistedMarkdownPath: canonicalMarkdownPath,
				validatedTitle,
				marksheetStatus: 'validated',
				parentName,
				parentEmail,
			};
		}

		const finalValidationIssues = validationResult.error.issues.map((issue) => ({
			path: issue.path.join('.'),
			message: issue.message,
			code: issue.code
		}));

		return {
			ok: false as const,
			errors: [],
			unresolvedErrors: finalValidationIssues,
		};
	}
});


