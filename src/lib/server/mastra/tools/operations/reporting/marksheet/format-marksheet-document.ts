import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { streamWithAutoRetry, type StreamWriterLike } from '../../../../agent-stream-retry';
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

function safeTitle(title: string | null | undefined): string {
  return (title || 'untitled').replace(/[^a-zA-Z0-9._-]/g, '_');
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

function studentFullName(json: Record<string, unknown>): string | undefined {
  const student = json.student as { fullName?: unknown } | undefined;
  if (student && typeof student.fullName === 'string') {
    return student.fullName;
  }
  return undefined;
}

export const formatMarksheetDocumentTool = createTool({
  id: 'format-marksheet-document',
  description:
    'Transform the extracted JSON into clean academic markdown. ' +
    'Emits data-createDocument stream parts (processing → streaming → success).',
  inputSchema: z.object({
    documentId: z.string().describe('The documentId of the marksheet to format.'),
  }),
  outputSchema: z.object({
    artifactId: z.string(),
    title: z.string(),
    markdown: z.string(),
    status: z.literal('success'),
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const entry = await findManifestEntry(tenant, input.documentId);
    const raw = await readExtractedJson(tenant, input.documentId);
    const json = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

    const studentName = studentFullName(json);
    const artifactId = `artifact-${input.documentId}`;
    const title = studentName ?? entry.fileName;

    if (writer) {
      await writer.write({
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'processing', content: '', title, id: artifactId },
      } as never);
    }

    const documentAgent = await getDocumentAgent();

    const prompt = [
      `Format this structured academic result for ${studentName ?? 'the student'} into clean, well-structured markdown.`,
      'Preserve every factual value, subject name, score, and grade from the JSON below.',
      'Render it as an academic report card that a parent can read at a glance.',
      '',
      '```json',
      JSON.stringify(json, null, 2),
      '```',
    ].join('\n');

    const stream = await streamWithAutoRetry({
      stream: () =>
        documentAgent.stream(prompt, {
          ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
          ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
        }),
      abortSignal: context.abortSignal,
      writer: writer ?? { write: async () => {} },
    });

    let markdown = '';
    for await (const chunk of stream.textStream) {
      if (typeof chunk !== 'string' || chunk.length === 0) continue;
      markdown += chunk;
      if (writer) {
        await writer.write({
          type: 'data-createDocument',
          id: artifactId,
          data: { status: 'streaming', content: markdown, title, id: artifactId },
        } as never);
      }
    }

    if (writer) {
      await writer.write({
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'success', content: markdown, title, id: artifactId },
      } as never);
    }

    if (tenant.examTypeId !== null) {
      const fs = await resolveTenantFilesystem(tenant);
      const persistPath = `exams/examType-${tenant.examTypeId}/${safeTitle(title)}.md`;
      await fs.writeFile(persistPath, markdown, { recursive: true });

      // Bug 1 fix: persist the actual artifact path on the request context so
      // the downstream awaitValidationStep can read the EXACT file on resume.
      // Without this, every resume failed with TENANT_OR_DOCUMENT_MISSING.
      const requestContext = context.requestContext;
      if (requestContext && typeof requestContext.set === 'function') {
        requestContext.set('formatArtifactState', {
          documentId: input.documentId,
          artifactId,
          persistPath,
          title,
          studentHint: entry.studentHint ?? null
        });
      }
    }

    return { artifactId, title, markdown, status: 'success' as const };
  },
});
