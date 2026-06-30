import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '../../../../agent-stream-retry';
import { tenantWorkspace } from '../../../../storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { readManifest, type ManifestEntry } from '../../../../storage/ocr/manifest-store';
import { removeCommittedDocument } from '../../../../storage/ocr/extracted-cleanup';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { marksheetSchema, type Marksheet } from '$lib/schema/marksheet';
import type { TenantContext } from '../../../../tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

const EXTRACTED_JSON_PATH = (documentId: string): string => `extracted/${documentId}.json`;

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

async function readExtractedJson(tenant: TenantContext, documentId: string): Promise<unknown> {
  const fs = await resolveTenantFilesystem(tenant);
  const path = EXTRACTED_JSON_PATH(documentId);
  if (!(await fs.exists(path))) {
    throw new Error(`EXTRACTED_NOT_FOUND: no extracted JSON at ${path} for documentId=${documentId}`);
  }
  const raw = await fs.readFile(path, { encoding: 'utf-8' });
  const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
  return JSON.parse(text);
}

async function findManifestEntry(
  tenant: TenantContext,
  documentId: string,
): Promise<ManifestEntry> {
  const manifest = await readManifest(tenant);
  const entry = manifest.documents.find((doc) => doc.documentId === documentId);
  if (!entry) {
    throw new Error(`MANIFEST_ENTRY_NOT_FOUND: documentId=${documentId} is not in the upload manifest`);
  }
  return entry;
}

export const commitMarksheetTool = createTool({
  id: 'commit-marksheet',
  description:
    'Write the JSON to the academic record via AssessmentService.upsertMarksheet. ' +
    'Removes the document from the manifest. Emits data-committed { artifactId, recordId, studentName, status: "committed" }.',
  inputSchema: z.object({
    documentId: z.string().describe('The documentId of the marksheet to commit.'),
  }),
  outputSchema: z.object({
    artifactId: z.string(),
    recordId: z.number(),
    studentName: z.string(),
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const entry = await findManifestEntry(tenant, input.documentId);
    const raw = await readExtractedJson(tenant, input.documentId);
    const validated: Marksheet = await marksheetSchema.parseAsync(raw);

    const artifactId = `artifact-${input.documentId}`;
    const ext = (entry.fileName.split('.').pop() ?? 'bin').toLowerCase();

    const service = await createAssessmentServiceForRequest(tenant);
    const response = await service.upsertMarksheet(
      validated,
      tenant.staffId,
    );
    const recordId = response.recordId ?? response.student.id;

    await removeCommittedDocument(tenant, input.documentId, entry.contentHash, ext);

    const studentName = validated.student?.fullName ?? 'Unknown';

    if (writer) {
      await writer.write({
        type: 'data-committed',
        id: artifactId,
        data: { artifactId, recordId, studentName, status: 'committed' },
      } as never);
    }

    return { artifactId, recordId, studentName };
  },
});
