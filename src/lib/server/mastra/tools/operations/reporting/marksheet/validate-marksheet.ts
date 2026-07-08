import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetSchema } from '$lib/schema/marksheet';
import { marksheetJsonPath, marksheetMarkdownPath } from '$lib/server/mastra/storage/workspaces/paths';
import { addEntry, removeEntry } from '$lib/server/mastra/storage/workspaces/manifest-store';
import { resolveMentionsInMarkdown } from '$lib/server/mastra/editor/mention-resolver';
import { AssessmentService } from '$lib/server/service/assessment.service';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';
import type { RequestContext } from '@mastra/core/request-context';
import type { ResolvedMention } from '$lib/server/mastra/editor/schemas';
import { writeDataPart, type MemoryContext } from '$lib/server/mastra/utils/chat-utils';

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

interface PermissionGrant {
	student?: boolean;
	examType?: boolean;
	academicYear?: boolean;
}

interface EffectiveIds {
	studentId: number | null;
	adminNo: number | null;
	studentName: string | null;
	examTypeId: number | null;
	academicId: number | null;
}

interface DisambiguationOption {
	id: string;
	label: string;
	description?: string;
}

function getTenant(ctx: MarksheetToolContext): TenantContext {
	const tenant = ctx.requestContext?.get('tenantContext') as TenantContext | undefined;
	if (!tenant) {
		throw new Error('TENANT_CONTEXT_REQUIRED: marksheet tools require an active tenantContext');
	}
	return tenant;
}

async function getDocumentAgent() {
	const { mastra } = await import('../../../../index');
	const agent = mastra.getAgent('document');
	if (!agent) {
		throw new Error('AGENT_NOT_REGISTERED: document agent is not registered on the Mastra instance');
	}
	return agent;
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
	grant: PermissionGrant
): EffectiveIds {
	const studentMention = mentions.find((m) => m.category === 'students');
	const academicMention = mentions.find((m) => m.category === 'academic_year');
	const examMention = mentions.find((m) => m.category === 'exam');

	return {
		studentId: toNumberOrNull(studentMention?.id) ?? (grant.student ? tenant.studentId : null),
		adminNo: studentMention?.admissionNo ? Number(studentMention.admissionNo) : null,
		studentName: studentMention?.studentName ?? null,
		examTypeId: toNumberOrNull(examMention?.id) ?? (grant.examType ? tenant.examTypeId : null),
		academicId:
			toNumberOrNull(academicMention?.id) ?? (grant.academicYear ? tenant.academicId : null)
	};
}

function detectMissingIds(
	effective: EffectiveIds,
	mentions: ResolvedMention[]
): MissingIdField[] {
	const hasStudentMention = mentions.some((m) => m.category === 'students');
	const hasExamMention = mentions.some((m) => m.category === 'exam');
	const hasAcademicMention = mentions.some((m) => m.category === 'academic_year');

	const missing: MissingIdField[] = [];
	if (effective.studentId === null) {
		missing.push({
			field: 'studentId',
			source: hasStudentMention ? 'mention_unresolved' : 'no_mention'
		});
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

function buildDisambiguationOptions(
	missing: MissingIdField[],
	tenant: TenantContext
): DisambiguationOption[] {
	const options: DisambiguationOption[] = [];

	for (const m of missing) {
		if (m.field === 'studentId' && tenant.studentId != null) {
			options.push({
				id: `student:use_tenant:${tenant.studentId}`,
				label: 'Use active student from tenant context',
				description: `Student ID: ${tenant.studentId}`
			});
		}
		if (m.field === 'examTypeId' && tenant.examTypeId != null) {
			options.push({
				id: `examType:use_tenant:${tenant.examTypeId}`,
				label: 'Use active exam type from tenant context',
				description: `Exam type ID: ${tenant.examTypeId}`
			});
		}
		if (m.field === 'academicId' && tenant.academicId != null) {
			options.push({
				id: `academicYear:use_tenant:${tenant.academicId}`,
				label: 'Use active academic year from tenant context',
				description: `Academic year ID: ${tenant.academicId}`
			});
		}
	}

	options.push({
		id: 'proceed:anyway',
		label: 'Proceed with what can be inferred (best-effort)',
		description: 'Continue validation; missing fields will be defaulted'
	});

	return options;
}

function buildDisambiguationPrompt(missing: MissingIdField[]): string {
	const fields = missing.map((m) => {
		switch (m.field) {
			case 'studentId':
				return 'student';
			case 'examTypeId':
				return 'exam type';
			case 'academicId':
				return 'academic year';
		}
	});
	if (fields.length === 1) return `Which ${fields[0]} is this marksheet for?`;
	if (fields.length === 2) return `Which ${fields[0]} and ${fields[1]} is this marksheet for?`;
	const last = fields[fields.length - 1];
	return `Which ${fields.slice(0, -1).join(', ')}, and ${last} is this marksheet for?`;
}

const marksheetErrorSchema = z.object({
	path: z.string(),
	message: z.string(),
	code: z.string()
});

const permissionGrantSchema = z
	.object({
		student: z.boolean().optional(),
		examType: z.boolean().optional(),
		academicYear: z.boolean().optional()
	})
	.optional();

export const validateMarksheetTool = createTool({
	id: 'validate-marksheet',
	description:
		'Re-derive the JSON from the corrected markdown via the document agent, ' +
		'then run marksheetSchema.safeParseAsync. Persists the validated JSON to marksheets/<studentId>.json ' +
		'and writes the user-corrected markdown to the canonical path ' +
		'marksheets/ADM<adminNo>-<examTypeId>-<studentName>.md (constructed from the validated JSON). ' +
		'If `currentMarkdownPath` is provided and differs from the canonical path, the draft is removed ' +
		'and its manifest entry cleared.',
	inputSchema: z.object({
		studentId: z
			.number()
			.int()
			.positive()
			.describe('The studentId whose marksheet JSON should be re-derived and validated.'),
		correctedMarkdown: z.string().describe('The user-corrected markdown to re-derive JSON from.'),
		currentMarkdownPath: z
			.string()
			.optional()
			.describe(
				'The filename-based draft path the editor panel auto-saved to (e.g., marksheets/adakole-a1b2c3d4.md). If provided and differs from the canonical path, the draft is removed after the canonical file is written.'
			),
		permissionGrant: permissionGrantSchema.describe(
			'Permission flags granted by the user (extracted from "use current X" statements). When granted, the tenant context field is used instead of triggering disambiguation.'
		),
		runId: z.string().optional().describe('The active workflow runId for emitting data-selectOption parts.')
	}),
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
			currentMarkdownPath: z
				.string()
				.optional()
				.describe('Echoes the input draft path so the client knows what was renamed away.')
		}),
		z.object({
			ok: z.literal(false),
			errors: z.array(marksheetErrorSchema),
			unresolvedErrors: z.array(marksheetErrorSchema)
		})
	]),
	execute: async (input, ctx) => {
		const context = ctx as MarksheetToolContext;
		const tenant = getTenant(context);

		// Auto-fix retry cap (Phase 2.3 — soft, requestContext may reset on resume).
		// Counts every invocation of validate-marksheet, which is invoked once per
		// resume cycle (validate → auto-fix → re-suspend → re-validate). After 3
		// cycles we throw AUTO_FIX_EXHAUSTED so the user cannot loop forever on the
		// same artifact. Phase 3 will replace this with the workflow's iterationCount.
		const autoFixAttempts =
			(context.requestContext?.get('autoFixAttempts') as number | undefined) ?? 0;
		if (autoFixAttempts >= 3) {
			throw new Error(
				'AUTO_FIX_EXHAUSTED: validation errors could not be auto-fixed after 3 attempts'
			);
		}
		context.requestContext?.set('autoFixAttempts', autoFixAttempts + 1);

		// PRE-FLIGHT PIPELINE
		// Resolves @mention IDs from the markdown, fetches the subject
		// mapping table, computes effective IDs (mentions > tenant-with-
		// permission > null), and detects any missing required IDs. If
		// any are missing, emits a data-selectOption part (which the UI
		// surfaces as an OptionDropdown disambiguation sheet) and seeds
		// `pendingSelection` so the existing selectionGateStep can
		// resume the workflow with the user's choice.

		const requestContext = context.requestContext as RequestContext | undefined;
		const { mentions } = await resolveMentionsInMarkdown(
			input.correctedMarkdown,
			requestContext,
			undefined
		);

		const inputGrant = (input.permissionGrant ?? {}) as PermissionGrant;
		const contextGrant = (requestContext?.get('permissionGrant') ?? {}) as PermissionGrant;
		const grant: PermissionGrant = { ...inputGrant, ...contextGrant };
		const effective = computeEffectiveIds(mentions, tenant, grant);
		const missing = detectMissingIds(effective, mentions);

		// Resolve thread/resource identity for `writeDataPart` persistence.
		// NOTE: `buildRequestContext` (chat route) only sets `tenantContext`,
		// `modelConfig`, `providerOptions`, `isSlashCommand`, `lastMessage`
		// on the request context — `threadId`/`resourceId` are NOT set there
		// (they live in the workflow's `inputData` instead, not the
		// requestContext). When the tool runs via a workflow path that
		// doesn't stash them on the request context, `memCtx` is undefined
		// and `writeDataPart` will skip persistence with a warning (the part
		// still streams to the client). A future change should hoist
		// `threadId`/`resourceId` onto the chat requestContext (see
		// buildRequestContext) so this tool can persist disambiguation
		// options across page reloads.
		const threadId = context.requestContext?.get('threadId') as string | undefined;
		const resourceId = context.requestContext?.get('resourceId') as string | undefined;
		const memCtx: MemoryContext | undefined = threadId && resourceId
			? { threadId, resourceId }
			: undefined;

		if (missing.length > 0) {
			const options = buildDisambiguationOptions(missing, tenant);
			const promptText = buildDisambiguationPrompt(missing);

			await writeDataPart(context.writer, {
				data: {
					type: 'data-selectOption',
					id: `gate-${input.runId ?? ''}-${Date.now()}`,
					data: {
						options,
						promptText,
						runId: input.runId ?? '',
						stepId: 'awaitValidation'
					}
				},
				memory: memCtx,
			});

			context.requestContext?.set('pendingSelection', {
				options,
				prompt: promptText,
				contextKey: 'pendingIdResolution'
			});

			return {
				ok: false as const,
				errors: [],
				unresolvedErrors: missing.map((m) => ({
					path: m.field,
					message: `${m.field.toUpperCase()}_REQUIRED: resolve via @mention, tenant grant, or disambiguation`,
					code: 'id_required'
				}))
			};
		}

		// All required IDs resolved. Fetch subject mapping table and
		// proceed with the existing documentAgent re-derivation pipeline.
		const mapping = await AssessmentService.getMappingData(
			tenant.staffId,
			tenant.classId ?? undefined,
			tenant.sectionId ?? undefined
		);

		const documentAgent = await getDocumentAgent();

		const subjectMappingTable = mapping.subjects
			.map((s) => {
				const subjectId = (s as { subjectId: number | null }).subjectId;
				const subjectCode = (s as { subjectCode: string | null }).subjectCode;
				const title = (s as { title?: string | null }).title;
				if (subjectId == null || subjectCode == null) return null;
				return `  - ${subjectCode} → subjectId=${subjectId}${title ? ` (${title})` : ''}`;
			})
			.filter((line): line is string => line !== null)
			.join('\n');

		const basePrompt = [
			`Re-derive the structured academic result JSON from the following markdown.`,
			`Use the SUBJECT MAPPING TABLE to populate each record's subjectId by exact subjectCode match (case-insensitive).`,
			`Use the EFFECTIVE IDS as authoritative values for student.id, student.adminNo, student.fullName, examType.id, and academicId (sessionYear).`,
			`Emit ONLY the JSON object that conforms to the Marksheet schema. Never wrap in markdown code fences.`,
			``,
			`TENANT CONTEXT:`,
			`  schoolId: ${tenant.schoolId}`,
			`  classId: ${tenant.classId ?? 'null'}`,
			`  sectionId: ${tenant.sectionId ?? 'null'}`,
			``,
			`EFFECTIVE IDS (from @mentions + permission grants — DO NOT override):`,
			`  studentId: ${effective.studentId}`,
			`  adminNo: ${effective.adminNo ?? 'null'}`,
			`  studentName: ${effective.studentName ?? 'null'}`,
			`  examTypeId: ${effective.examTypeId}`,
			`  academicId: ${effective.academicId}`,
			``,
			`SUBJECT MAPPING TABLE (subjectCode → subjectId):`,
			subjectMappingTable || '  (no subjects configured for this class)',
			``,
			`SCHEMA REQUIREMENTS (every field must be present and correctly typed):`,
			`- school: object { id, name, email, phone, city, state, title, vacation_date }`,
			`- student: object { id, examId, fullName, gender, parentEmail, parentName, term, title, category, className, sectionName, adminNo, sessionYear, daysOpened, daysAbsent, daysPresent, token }`,
			`- subjects: array of { subjectId, subjectCode, teacherId, title }`,
			`- records: array of { studentId, resultId, subjectId, subject, subjectCode, titleIds, titles, markIds, marks, fullMarks, totalScore, grade, category, learningOutcome, objectives }`,
			`- score: object { total, average, classAverage, maxScores }`,
			`- ratings: array of { attribute, rate, remark, color }`,
			`- remark: object { remark }`,
			`- examType: object { id, title }`,
			``,
			`CRITICAL:`,
			`- Look up subjectId from the SUBJECT MAPPING TABLE by exact subjectCode. NEVER invent a subjectId.`,
			`- If a subjectCode in the markdown is not in the mapping table, set subjectId to null and emit a flag.`,
			`- For DAYCARE: learningOutcome is required and must not contain HTML tags.`,
			`- For non-DAYCARE: titles must match TITLES_BY_CATEGORY and marks.length === titles.length.`,
			`- Output ONLY the JSON object. No markdown fences, no commentary.`,
			``,
			`\`\`\`markdown`,
			input.correctedMarkdown,
			`\`\`\``
		].join('\n');

		interface AttemptResult {
			json: unknown;
			validationErrors: Array<{ path: string; message: string; code: string }>;
			attempt: number;
		}

		const attempts: AttemptResult[] = [];
		let finalJson: unknown = null;
		let finalValidationIssues: Array<{ path: string; message: string; code: string }> = [];

		for (let attempt = 0; attempt < 3; attempt++) {
			const feedback = attempts
				.map(
					(a) =>
						`Attempt ${a.attempt + 1} failed with these validation errors:\n` +
						a.validationErrors.map((e) => `  - ${e.path || 'root'}: ${e.message}`).join('\n') +
						'\nFix these specific issues and try again.'
				)
				.join('\n\n');

			const prompt = feedback ? `${basePrompt}\n\n${feedback}` : basePrompt;

			try {
				const response = await documentAgent.generate(prompt, {
					...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
					...(context.requestContext ? { requestContext: context.requestContext as never } : {})
				});
				finalJson =
					(response as { object?: unknown }).object ??
					(() => {
						const text = (response as { text?: string }).text ?? '';
						try {
							return JSON.parse(text);
						} catch {
							return null;
						}
					})();
				if (finalJson === null || finalJson === undefined) {
					attempts.push({
						json: null,
						validationErrors: [
							{ path: '$', message: 'STRUCTURED_OUTPUT_EMPTY', code: 'empty_output' }
						],
						attempt
					});
					continue;
				}
				const parsed = await marksheetSchema.safeParseAsync(finalJson);
				if (parsed.success) {
					const fs = await resolveTenantFilesystem(tenant);

					const jsonPath = marksheetJsonPath(input.studentId);
					await fs.writeFile(jsonPath, JSON.stringify(finalJson, null, 2), {
						recursive: true
					});
					await addEntry(tenant, {
						path: jsonPath,
						kind: 'marksheet-json',
						studentId: input.studentId,
						uploadedAt: new Date().toISOString(),
						modifiedAt: new Date().toISOString(),
						mimeType: 'application/json'
					});

					const canonicalMarkdownPath = marksheetMarkdownPath({
						studentId: parsed.data.student.id,
						adminNo: parsed.data.student.adminNo,
						examTypeId: parsed.data.examType?.id ?? null,
						studentName: parsed.data.student.fullName
					});
					const validatedTitle = `${parsed.data.student.fullName} — ${parsed.data.examType?.title ?? 'Exam'}`;

					await fs.writeFile(canonicalMarkdownPath, input.correctedMarkdown, {
						recursive: true
					});
					await addEntry(tenant, {
						path: canonicalMarkdownPath,
						kind: 'marksheet-markdown',
						documentId: String(parsed.data.student.id),
						fileName: canonicalMarkdownPath.split('/').pop(),
						studentId: parsed.data.student.id,
						uploadedAt: new Date().toISOString(),
						modifiedAt: new Date().toISOString(),
						mimeType: 'text/markdown'
					});

					if (input.currentMarkdownPath && input.currentMarkdownPath !== canonicalMarkdownPath) {
						if (await fs.exists(input.currentMarkdownPath)) {
							await fs.deleteFile(input.currentMarkdownPath);
						}
						await removeEntry(tenant, input.currentMarkdownPath);
					}

					return {
						ok: true as const,
						json: finalJson,
						persistedMarkdownPath: canonicalMarkdownPath,
						validatedTitle,
						currentMarkdownPath: input.currentMarkdownPath
					};
				}
				finalValidationIssues = parsed.error.issues.map((issue) => ({
					path: issue.path.join('.'),
					message: issue.message,
					code: issue.code
				}));
				attempts.push({ json: finalJson, validationErrors: finalValidationIssues, attempt });
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const retryAfterSec = parseRetryAfter(err);
				if (retryAfterSec > 0 && attempt < 2) {
					await sleep(retryAfterSec * 1000);
					attempts.push({
						json: null,
						validationErrors: [{ path: '$', message: 'RATE_LIMITED', code: 'rate_limited' }],
						attempt
					});
					continue;
				}
				const issues = parseStructuredOutputError(message);
				attempts.push({ json: null, validationErrors: issues, attempt });
			}
		}

		return {
			ok: false as const,
			errors: [],
			unresolvedErrors:
				finalValidationIssues.length > 0
					? finalValidationIssues
					: (attempts[attempts.length - 1]?.validationErrors ?? [
						{
							path: '$',
							message:
								'STRUCTURED_OUTPUT_FAILED: document agent could not produce a marksheetSchema-conformant JSON after 3 attempts',
							code: 'exhausted_retries'
						}
					])
		};
	}
});

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(err: unknown): number {
	if (!err || typeof err !== 'object') return 0;
	const e = err as {
		message?: string;
		statusCode?: number;
		responseHeaders?: Record<string, string>;
		data?: unknown;
	};
	const msg = typeof e.message === 'string' ? e.message : '';
	const match = msg.match(/try again in ([0-9.]+)s/i);
	if (match && match[1]) return Math.ceil(parseFloat(match[1]));
	if (e.responseHeaders && typeof e.responseHeaders === 'object') {
		const ra = e.responseHeaders['retry-after'] ?? e.responseHeaders['x-ratelimit-reset'];
		if (ra) {
			const secs = parseInt(ra, 10);
			if (!Number.isNaN(secs)) return secs;
		}
	}
	if (e.statusCode === 429) return 10;
	return 0;
}

function parseStructuredOutputError(
	message: string
): Array<{ path: string; message: string; code: string }> {
	const lines = message.split('\n').filter((l) => l.trim().startsWith('- '));
	if (lines.length === 0) {
		return [{ path: '$', message, code: 'structured_output_failed' }];
	}
	return lines.map((line) => {
		const trimmed = line.replace(/^- /, '').trim();
		const colonIdx = trimmed.indexOf(':');
		if (colonIdx === -1) {
			return { path: '$', message: trimmed, code: 'structured_output_failed' };
		}
		const path = trimmed.slice(0, colonIdx).trim();
		const msg = trimmed.slice(colonIdx + 1).trim();
		return { path: path || '$', message: msg, code: 'structured_output_failed' };
	});
}
