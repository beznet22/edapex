import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetJsonPath } from '$lib/server/workspace/paths';
import { addEntry, readManifest as readWorkspaceManifest, updateEntry, updateEntryStatus } from '$lib/server/workspace/manifest';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { marksheetSchema, type Marksheet } from '$lib/schema/marksheet';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

interface MarksheetToolContext {
	requestContext?: {
		get<T = unknown>(key: string): T | undefined;
	};
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

const marksheetCommitErrorSchema = z.object({
	path: z.string(),
	message: z.string(),
	code: z.string()
});

export const commitMarksheetTool = createTool({
	id: 'commit-marksheet',
	description:
		'Read marksheets/<studentId>.json, validate via marksheetSchema, write to the academic record via ' +
		'AssessmentService.upsertMarksheet. Returns { ok: true, artifactId, recordId, studentName } on success, ' +
		'{ ok: false, errors: [{path, message, code}] } on failure. ' +
		'Possible failure codes: STAFF_ID_REQUIRED, MARKSHEET_JSON_NOT_FOUND, MARKSHEET_JSON_MALFORMED, ' +
		'ZOD_<issueCode>, UPSERT_FAILED, MISSING_LINKAGE, NO_MARKS_PROCESSED, PROCESS_MARKS_FAILED. ' +
		'Does not throw; never emits data parts.',
	inputSchema: z.object({
		studentId: z.number().int().positive().describe('The studentId whose marksheet should be committed.'),
		reason: z.string().describe('Human-readable action summary for user approval.')
	}),
	requireApproval: true,
	outputSchema: z.discriminatedUnion('ok', [
		z.object({
			ok: z.literal(true),
			artifactId: z.string(),
			recordId: z.number(),
			studentName: z.string(),
			marksheetStatus: z.string().describe('Current lifecycle status: committed.')
		}),
		z.object({
			ok: z.literal(false),
			errors: z.array(marksheetCommitErrorSchema)
		})
	]),
	execute: async (input, ctx) => {
		const context = ctx as MarksheetToolContext;
		const tenant = getTenant(context);

		if (tenant.staffId <= 0) {
			return {
				ok: false as const,
				errors: [
					{
						path: 'tenant.staffId',
						message:
							'STAFF_ID_REQUIRED: committing a marksheet requires a valid staffId in TenantContext',
						code: 'STAFF_ID_REQUIRED'
					}
				]
			};
		}

		const fs = await resolveTenantFilesystem(tenant);
		if (tenant.examTypeId == null) {
			return {
				ok: false as const,
				errors: [
					{
						path: 'tenant.examTypeId',
						message: 'EXAM_TYPE_REQUIRED: committing a marksheet requires an active examTypeId',
						code: 'EXAM_TYPE_REQUIRED'
					}
				]
			};
		}
		const examTypeId = tenant.examTypeId;
		const jsonPath = marksheetJsonPath(input.studentId, examTypeId);
		if (!(await fs.exists(jsonPath))) {
			return {
				ok: false as const,
				errors: [
					{
						path: 'jsonPath',
						message: `MARKSHEET_JSON_NOT_FOUND: no JSON at ${jsonPath} for studentId=${input.studentId}`,
						code: 'MARKSHEET_JSON_NOT_FOUND'
					}
				]
			};
		}

		const raw = await fs.readFile(jsonPath, { encoding: 'utf-8' });
		const text = typeof raw === 'string' ? raw : raw.toString('utf-8');

		let validated: Marksheet;
		try {
			validated = await marksheetSchema.parseAsync(JSON.parse(text));
		} catch (err) {
			if (err instanceof z.ZodError) {
				return {
					ok: false as const,
					errors: err.issues.map((issue) => ({
						path: issue.path.join('.'),
						message: issue.message,
						code: 'ZOD_' + String(issue.code).toUpperCase()
					}))
				};
			}
			return {
				ok: false as const,
				errors: [
					{
						path: 'jsonPath',
						message:
							'MARKSHEET_JSON_MALFORMED: ' + (err instanceof Error ? err.message : String(err)),
						code: 'MARKSHEET_JSON_MALFORMED'
					}
				]
			};
		}

		const artifactId = `artifact-student-${input.studentId}`;
		let recordId: number;
		try {
			const service = await createAssessmentServiceForRequest(tenant);
			const response = await service.upsertMarksheet(validated, tenant.staffId);
			recordId = response.recordId ?? validated.student?.id ?? input.studentId;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			let code: string = 'UPSERT_FAILED';
			if (message.includes('STAFF_ID_REQUIRED')) code = 'STAFF_ID_REQUIRED';
			else if (message.includes('missing required class/section/record/category linkage'))
				code = 'MISSING_LINKAGE';
			else if (message.includes('No marks or results were processed')) code = 'NO_MARKS_PROCESSED';
			else if (message.includes('Failed to process marks')) code = 'PROCESS_MARKS_FAILED';
			return {
				ok: false as const,
				errors: [{ path: 'upsertMarksheet', message, code }]
			};
		}

		await addEntry(
			tenant,
			{
				path: jsonPath,
				kind: 'marksheet-json',
				status: 'Committed',
				studentId: input.studentId,
				examTypeId,
				recordId,
				uploadedAt: new Date().toISOString(),
				modifiedAt: new Date().toISOString(),
				mimeType: 'application/json'
			},
			examTypeId
		);
		await updateEntryStatus(tenant, jsonPath, 'committed', examTypeId);

		const commitManifest = await readWorkspaceManifest(tenant, examTypeId);
		const commitSource = Object.values(commitManifest.entries).find(
			(e) => e.kind === 'user-file' && e.studentId === input.studentId
		);
		if (commitSource) {
			await updateEntry(tenant, commitSource.path, { status: 'Committed' }, examTypeId);
		}

		const studentName = validated.student?.fullName ?? 'Unknown';
		return { ok: true as const, artifactId, recordId, studentName, marksheetStatus: 'committed' as const };
	}
});
