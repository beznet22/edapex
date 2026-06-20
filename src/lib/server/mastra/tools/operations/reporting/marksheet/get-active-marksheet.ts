import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '../../../../agent-stream-retry';
import { tenantWorkspace } from '../../../../storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { readManifest, type ManifestEntry } from '../../../../storage/ocr/manifest-store';
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

export const getActiveMarksheetTool = createTool({
  id: 'get-active-marksheet',
  description:
    'Read the extracted JSON for the most recently referenced marksheet. ' +
    'Returns the JSON, fileName, and contentHash.',
  inputSchema: z.object({
    documentId: z
      .string()
      .optional()
      .describe('Optional explicit documentId. Falls back to the request context defaultDocumentId.'),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    fileName: z.string(),
    contentHash: z.string(),
    json: z.record(z.string(), z.unknown()),
    examTypeId: z.number().nullable(),
    studentHint: z
      .object({
        fullName: z.string().optional(),
        admissionNo: z.number().optional(),
      })
      .optional(),
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);

    const inputDocumentId = input.documentId;
    const fallbackDocumentId = context.requestContext?.get('defaultDocumentId') as string | undefined;
    const documentId = inputDocumentId ?? fallbackDocumentId;
    if (!documentId) {
      throw new Error('DOCUMENT_ID_REQUIRED: provide input.documentId or set defaultDocumentId on the request context');
    }

    const entry = await findManifestEntry(tenant, documentId);
    const raw = await readExtractedJson(tenant, documentId);
    const json = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;

    return {
      documentId,
      fileName: entry.fileName,
      contentHash: entry.contentHash,
      json,
      examTypeId: tenant.examTypeId,
      studentHint: entry.studentHint,
    };
  },
});
