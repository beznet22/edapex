import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { tenantWorkspace } from '$lib/server/workspace';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { readManifest as readNewManifest } from '$lib/server/workspace/manifest';
import { marksheetJsonPath } from '$lib/server/workspace/paths';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

interface MarksheetToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
  };
  writer?: StreamWriterLike;
  abortSignal?: AbortSignal;
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

export const getActiveMarksheetTool = createTool({
  id: 'get-active-marksheet',
  description:
    'Read the current validated JSON for a student at marksheets/<studentId>.json. ' +
    'Returns the JSON plus manifest entry info.',
  inputSchema: z.object({
    studentId: z.number().int().positive().describe('The studentId whose marksheet should be read.'),
  }),
  outputSchema: z.object({
    studentId: z.number(),
    json: z.record(z.string(), z.unknown()).nullable(),
    examTypeId: z.number().nullable(),
    committedAt: z.string().nullable(),
    recordId: z.number().nullable(),
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);

    const fs = await resolveTenantFilesystem(tenant);
    const jsonPath = marksheetJsonPath(input.studentId, tenant.examTypeId);
    if (!(await fs.exists(jsonPath))) {
      return {
        studentId: input.studentId,
        json: null,
        examTypeId: tenant.examTypeId,
        committedAt: null,
        recordId: null
      };
    }
    const raw = await fs.readFile(jsonPath, { encoding: 'utf-8' });
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const json = JSON.parse(text) as Record<string, unknown>;

    // Look up manifest entry for recordId + committedAt
    const manifest = await readNewManifest(tenant);
    const entry = manifest.entries[jsonPath];

    return {
      studentId: input.studentId,
      json,
      examTypeId: tenant.examTypeId,
      committedAt: entry?.uploadedAt ?? null,
      recordId: entry?.recordId ?? null
    };
  },
});