import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '../../../../agent-stream-retry';
import { writeDataPart, type MemoryContext } from '$lib/server/mastra/utils/chat-utils';
import { tenantWorkspace } from '../../../../storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetJsonPath } from '../../../../storage/workspaces/paths';
import { addEntry } from '../../../../storage/workspaces/manifest-store';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { marksheetSchema, type Marksheet } from '$lib/schema/marksheet';
import type { TenantContext } from '../../../../tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

interface MarksheetToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
}

function getWriter(ctx: MarksheetToolContext): StreamWriterLike | undefined {
  return ctx.writer;
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

export const commitMarksheetTool = createTool({
  id: 'commit-marksheet',
  description:
    'Read marksheets/<studentId>.json, validate via marksheetSchema, write to the academic record via ' +
    'AssessmentService.upsertMarksheet. Emits data-committed { artifactId, recordId, studentName, status: "committed" }.',
  inputSchema: z.object({
    studentId: z.number().int().positive().describe('The studentId whose marksheet should be committed.'),
    reason: z.string().describe('Human-readable action summary for user approval.'),
  }),
  requireApproval: true,
  outputSchema: z.object({
    artifactId: z.string(),
    recordId: z.number(),
    studentName: z.string(),
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const threadId = context.requestContext?.get('threadId') as string | undefined;
    const resourceId = context.requestContext?.get('resourceId') as string | undefined;
    const memCtx: MemoryContext | undefined = threadId && resourceId
      ? { threadId, resourceId }
      : undefined;

    if (tenant.staffId <= 0) {
      throw new Error('STAFF_ID_REQUIRED: committing a marksheet requires a valid staffId in TenantContext');
    }

    const fs = await resolveTenantFilesystem(tenant);
    const jsonPath = marksheetJsonPath(input.studentId);
    if (!(await fs.exists(jsonPath))) {
      throw new Error(`MARKSHEET_JSON_NOT_FOUND: no JSON at ${jsonPath} for studentId=${input.studentId}`);
    }
    const raw = await fs.readFile(jsonPath, { encoding: 'utf-8' });
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const validated: Marksheet = await marksheetSchema.parseAsync(JSON.parse(text));

    const artifactId = `artifact-student-${input.studentId}`;

    const service = await createAssessmentServiceForRequest(tenant);
    const response = await service.upsertMarksheet(validated, tenant.staffId);
    const recordId = response.recordId ?? validated.student?.id ?? input.studentId;

    // Update manifest with committed recordId
    await addEntry(tenant, {
      path: jsonPath,
      kind: 'marksheet-json',
      studentId: input.studentId,
      recordId,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      mimeType: 'application/json'
    });

    const studentName = validated.student?.fullName ?? 'Unknown';

    await writeDataPart(writer as never, {
      data: {
        type: 'data-committed',
        id: artifactId,
        data: { artifactId, recordId, studentName, status: 'committed' },
      },
      memory: memCtx,
    });

    return { artifactId, recordId, studentName };
  },
});
