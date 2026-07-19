import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { transcriptSchema } from '$lib/schema/transcript';
import { transcriptJsonPath, transcriptMarkdownPath } from '$lib/server/workspace/paths';
import { addEntry, readManifest as readWorkspaceManifest, removeEntry, updateEntry } from '$lib/server/workspace/manifest';
import { resolveMentionsInMarkdown } from '$lib/server/mastra/editor/mention-resolver';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';
import type { RequestContext } from '@mastra/core/request-context';
import type { ResolvedMention } from '$lib/server/mastra/editor/schemas';
import { writeDataPart, type MemoryContext } from '$lib/server/mastra/utils/chat-utils';

interface TranscriptToolContext {
	requestContext?: {
		get<T = unknown>(key: string): T | undefined;
		set<T = unknown>(key: string, value: T): void;
	};
	writer?: StreamWriterLike;
	abortSignal?: AbortSignal;
}

interface MissingIdField {
	field: 'studentId' | 'academicId';
	source: 'no_mention' | 'mention_unresolved' | 'tenant_unset';
}

interface PermissionGrant {
	student?: boolean;
	academicYear?: boolean;
}

interface EffectiveIds {
	studentId: number | null;
	adminNo: number | null;
	studentName: string | null;
	academicId: number | null;
}

interface DisambiguationOption {
	id: string;
	label: string;
	description?: string;
}

function getTenant(ctx: TranscriptToolContext): TenantContext {
	const tenant = ctx.requestContext?.get('tenantContext') as TenantContext | undefined;
	if (!tenant) {
		throw new Error('TENANT_CONTEXT_REQUIRED: transcript tools require an active tenantContext');
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

	return {
		studentId: toNumberOrNull(studentMention?.id) ?? (grant.student ? tenant.studentId : null),
		adminNo: studentMention?.admissionNo ? Number(studentMention.admissionNo) : null,
		studentName: studentMention?.studentName ?? null,
		academicId:
			toNumberOrNull(academicMention?.id) ?? (grant.academicYear ? tenant.academicId : null)
	};
}

function detectMissingIds(
	effective: EffectiveIds,
	mentions: ResolvedMention[]
): MissingIdField[] {
	const hasStudentMention = mentions.some((m) => m.category === 'students');
	const hasAcademicMention = mentions.some((m) => m.category === 'academic_year');

	const missing: MissingIdField[] = [];
	if (effective.studentId === null) {
		missing.push({
			field: 'studentId',
			source: hasStudentMention ? 'mention_unresolved' : 'no_mention'
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
			case 'academicId':
				return 'academic year';
		}
	});
	if (fields.length === 1) return `Which ${fields[0]} is this transcript for?`;
	if (fields.length === 2) return `Which ${fields[0]} and ${fields[1]} is this transcript for?`;
	const last = fields[fields.length - 1];
	return `Which ${fields.slice(0, -1).join(', ')}, and ${last} is this transcript for?`;
}

const transcriptErrorSchema = z.object({
	path: z.string(),
	message: z.string(),
	code: z.string()
});

const permissionGrantSchema = z
	.object({
		student: z.boolean().optional(),
		academicYear: z.boolean().optional()
	})
	.optional();

export const validateTranscriptTool = createTool({
	id: 'validate-transcript',
	description:
		'Re-derive the JSON from the corrected transcript markdown via the document agent, ' +
		'then run transcriptSchema.safeParseAsync. Persists the validated JSON to transcripts/<studentId>.json ' +
		'and writes the user-corrected markdown to the canonical path transcripts/<studentId>.md. ' +
		'If `currentMarkdownPath` is provided and differs from the canonical path, the draft is removed ' +
		'and its manifest entry cleared.',
	inputSchema: z.object({
		studentId: z
			.number()
			.int()
			.positive()
			.describe('The studentId whose transcript JSON should be re-derived and validated.'),
		correctedMarkdown: z.string().describe('The user-corrected transcript markdown to re-derive JSON from.'),
		currentMarkdownPath: z
			.string()
			.optional()
			.describe(
				'The filename-based draft path the editor panel auto-saved to (e.g., transcripts/adakole-a1b2c3d4.md). If provided and differs from the canonical path, the draft is removed after the canonical file is written.'
			),
		permissionGrant: permissionGrantSchema.describe(
			'Permission flags granted by the user (extracted from "use current X" statements). When granted, the tenant context field is used instead of triggering disambiguation.'
		),
		runId: z.string().optional().describe('The active workflow runId for emitting data-selectOption parts.'),
		reason: z.string().describe('Human-readable action summary for user approval.'),
		title: z
			.string()
			.optional()
			.describe('Optional display title the caller wants reflected in headings or metadata.'),
		filename: z
			.string()
			.optional()
			.describe(
				'Optional canonical filename the output should be saved to (e.g., "transcripts/<studentId>.md").'
			)
	}),
	requireApproval: true,
	outputSchema: z.discriminatedUnion('ok', [
		z.object({
			ok: z.literal(true),
			json: z.unknown(),
			persistedMarkdownPath: z
				.string()
				.describe('Canonical path the markdown was written to: transcripts/<studentId>.md'),
			validatedTitle: z
				.string()
				.describe(
					'Display title derived from the validated JSON: `${student.fullName} — Transcript ${academicYear.title}`.'
				),
			currentMarkdownPath: z
				.string()
				.optional()
				.describe('Echoes the input draft path so the client knows what was renamed away.')
		}),
		z.object({
			ok: z.literal(false),
			errors: z.array(transcriptErrorSchema),
			unresolvedErrors: z.array(transcriptErrorSchema)
		})
	]),
	execute: async (input, ctx) => {
		const context = ctx as TranscriptToolContext;
		const tenant = getTenant(context);

		// Auto-fix retry cap mirrors validate-marksheet: counts every
		// invocation of validate-transcript (one per resume cycle).
		// After 3 cycles we throw AUTO_FIX_EXHAUSTED so the user cannot
		// loop forever on the same artifact.
		const autoFixAttempts =
			(context.requestContext?.get('autoFixAttempts') as number | undefined) ?? 0;
		if (autoFixAttempts >= 3) {
			throw new Error(
				'AUTO_FIX_EXHAUSTED: validation errors could not be auto-fixed after 3 attempts'
			);
		}
		context.requestContext?.set('autoFixAttempts', autoFixAttempts + 1);

		// PRE-FLIGHT PIPELINE
		// Resolves @mention IDs from the markdown, computes effective IDs
		// (mentions > tenant-with-permission > null), and detects any
		// missing required IDs. If any are missing, emits a
		// data-selectOption part (which the UI surfaces as an
		// OptionDropdown disambiguation sheet) and seeds `pendingSelection`
		// so the existing selectionGateStep can resume the workflow with
		// the user's choice.

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
		// `buildRequestContext` (chat route) only sets `tenantContext`,
		// `modelConfig`, `providerOptions`, `isSlashCommand`, `lastMessage`
		// on the request context — `threadId`/`resourceId` are NOT set
		// there (they live in the workflow's `inputData` instead). When
		// the tool runs via a workflow path that doesn't stash them on
		// the request context, `memCtx` is undefined and `writeDataPart`
		// will skip persistence with a warning (the part still streams to
		// the client).
		const threadId = context.requestContext?.get('threadId') as string | undefined;
		const resourceId = context.requestContext?.get('resourceId') as string | undefined;
		const memCtx: MemoryContext | undefined = threadId && resourceId
			? { threadId, resourceId }
			: undefined;

		if (missing.length > 0) {
			const options = buildDisambiguationOptions(missing, tenant);
			const promptText = buildDisambiguationPrompt(missing);

			await writeDataPart(context.writer as never, {
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
		const assessment = await createAssessmentServiceForRequest(tenant);
		const mapping = await assessment.getMappingData(
			tenant.classId!,
			tenant.sectionId!
		);
		const documentAgent = await getDocumentAgent();

		const subjectMappingTable = mapping.subjects
			.map((s) => {
				const subjectId = s.id;
				const subjectCode = s.subjectCode;
				const title = s.subjectName;
				if (subjectId == null || subjectCode == null) return null;
				return `  - ${subjectCode} → subjectId=${subjectId}${title ? ` (${title})` : ''}`;
			})
			.filter((line: string | null): line is string => line !== null)
			.join('\n');

		const basePrompt = [
			`Re-derive the structured multi-term academic transcript JSON from the following markdown.`,
			`Use the SUBJECT MAPPING TABLE to populate each row's subjectId by exact subjectCode match (case-insensitive).`,
			`Use the EFFECTIVE IDS as authoritative values for student.id and academicYear.id.`,
			`Emit ONLY the JSON object that conforms to the Transcript schema. Never wrap in markdown code fences.`,
			``,
			`TENANT CONTEXT:`,
			`  schoolId: ${tenant.schoolId}`,
			`  classId: ${tenant.classId ?? 'null'}`,
			`  sectionId: ${tenant.sectionId ?? 'null'}`,
			``,
			`EFFECTIVE IDS (from @mentions + permission grants — DO NOT override):`,
			`  studentId: ${effective.studentId}`,
			`  academicYearId: ${effective.academicId}`,
			``,
			`TITLE (from caller, verbatim): "${input.title ?? '(none)'}". If a title is supplied, reflect it verbatim in any headings or front-matter.`,
			`FILENAME (from caller, do not alter): "${input.filename ?? '(derive from canonical path)'}". Your output will be persisted to that filename by the calling tool.`,
			``,
			`SUBJECT MAPPING TABLE (subjectCode → subjectId):`,
			subjectMappingTable || '  (no subjects configured for this class)',
			``,
			`SCHEMA REQUIREMENTS (every field must be present and correctly typed):`,
			`- school: object { id, name, email, phone, city, state, title, vacation_date }`,
			`- student: object { id, examId, fullName, gender, parentEmail, parentName, term, title, category, className, sectionName, adminNo, sessionYear, daysOpened, daysAbsent, daysPresent, token }`,
			`- academicYear: object { id, title, year }`,
			`- terms: array of { examTypeId, title, isAverage }`,
			`- subjects: array of { subjectId, subject, subjectCode, marks (1-3 entries), total, percentage, grade, color? }`,
			`- classAverage, studentAverage, yearlyTotal, yearlyAverage, maxPossibleTotal: numbers`,
			``,
			`CRITICAL:`,
			`- marks.length must equal terms.length for each subject.`,
			`- SubjectId must be looked up from the SUBJECT MAPPING TABLE by exact subjectCode (case-insensitive). NEVER invent a subjectId.`,
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
				const parsed = await transcriptSchema.safeParseAsync(finalJson);
				if (parsed.success) {
					const fs = await resolveTenantFilesystem(tenant);
					if (tenant.examTypeId == null) {
						return {
							ok: false as const,
							errors: [
								{ path: 'tenant.examTypeId', message: 'EXAM_TYPE_REQUIRED: validate-transcript needs an active examTypeId', code: 'EXAM_TYPE_REQUIRED' }
							],
							attempt
						};
					}
					const examTypeId = tenant.examTypeId;

					const jsonPath = transcriptJsonPath(input.studentId, examTypeId);
					await fs.writeFile(jsonPath, JSON.stringify(finalJson, null, 2), {
						recursive: true
					});
					await addEntry(
						tenant,
						{
							path: jsonPath,
							kind: 'transcript-json',
							status: 'Validated',
							studentId: input.studentId,
							academicId: parsed.data.academicYear.id,
							examTypeId,
							uploadedAt: new Date().toISOString(),
							modifiedAt: new Date().toISOString(),
							mimeType: 'application/json'
						},
						examTypeId
					);

					const canonicalMarkdownPath = transcriptMarkdownPath(parsed.data.student.id, examTypeId);
					const validatedTitle = `${parsed.data.student.fullName} — Transcript ${parsed.data.academicYear.title}`;

					await fs.writeFile(canonicalMarkdownPath, input.correctedMarkdown, {
						recursive: true
					});
					await addEntry(
						tenant,
						{
							path: canonicalMarkdownPath,
							kind: 'transcript-markdown',
							status: 'Validated',
							documentId: String(parsed.data.student.id),
							fileName: canonicalMarkdownPath.split('/').pop(),
							studentId: parsed.data.student.id,
							academicId: parsed.data.academicYear.id,
							uploadedAt: new Date().toISOString(),
							modifiedAt: new Date().toISOString(),
							mimeType: 'text/markdown'
						},
						examTypeId
					);

					if (input.currentMarkdownPath && input.currentMarkdownPath !== canonicalMarkdownPath) {
						if (await fs.exists(input.currentMarkdownPath)) {
							await fs.deleteFile(input.currentMarkdownPath);
						}
						await removeEntry(tenant, input.currentMarkdownPath, examTypeId);
					}

					const transcriptManifest = await readWorkspaceManifest(tenant, examTypeId);
					const transcriptSource = Object.values(transcriptManifest.entries).find(
						(e) => e.kind === 'user-file' && e.studentId === input.studentId
					);
					if (transcriptSource) {
						await updateEntry(tenant, transcriptSource.path, { status: 'Validated' }, examTypeId);
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
								'STRUCTURED_OUTPUT_FAILED: document agent could not produce a transcriptSchema-conformant JSON after 3 attempts',
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
