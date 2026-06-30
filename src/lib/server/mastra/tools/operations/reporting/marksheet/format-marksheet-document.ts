import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { readManifest as readWorkspaceManifest } from '$lib/server/mastra/storage/workspaces/manifest-store';
import { ocrMarkdownPath, marksheetMarkdownPath } from '$lib/server/mastra/storage/workspaces/paths';
import { addEntry } from '$lib/server/mastra/storage/workspaces/manifest-store';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { streamWithAutoRetry, type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

interface MarksheetToolContext {
  requestContext?: {
    get<T = unknown>(key: string): T | undefined;
    set<T = unknown>(key: string, value: T): void;
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

export const formatMarksheetDocumentTool = createTool({
  id: 'format-marksheet-document',
  description:
    'Transform OCR markdown into clean academic report markdown. ' +
    'Reads ocr/<fileName>.md, re-formats via document agent, persists to marksheets/<studentId>-<slug>.md ' +
    '(or marksheets/ocr-<documentId>.md if no studentHint yet). Emits data-createDocument stream parts.',
  inputSchema: z.object({
    documentId: z.string().describe('The documentId of the marksheet to format.')
  }),
  outputSchema: z.object({
    artifactId: z.string(),
    title: z.string(),
    markdown: z.string(),
    persistPath: z.string(),
    studentId: z.number().nullable(),
    status: z.literal('success')
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);
    const writer = context.writer;

    // 1. Find manifest entry by documentId in the single workspace manifest.
    // The legacy `extracted/manifest.json` is no longer used; all upload
    // metadata lives in the single manifest.json at workspace root.
    const manifest = await readWorkspaceManifest(tenant);
    const entry = Object.values(manifest.entries).find((e) => e.documentId === input.documentId);
    if (!entry || !entry.fileName) {
      throw new Error(
        `MANIFEST_ENTRY_NOT_FOUND: documentId=${input.documentId} is not in the workspace manifest`
      );
    }

    // 2. Read OCR markdown from canonical path
    const fs = await resolveTenantFilesystem(tenant);
    const mdRelPath = ocrMarkdownPath(entry.fileName);
    if (!(await fs.exists(mdRelPath))) {
      throw new Error(`OCR_MARKDOWN_NOT_FOUND: no markdown at ${mdRelPath}`);
    }
    const raw = await fs.readFile(mdRelPath, { encoding: 'utf-8' });
    const ocrMarkdown = typeof raw === 'string' ? raw : raw.toString('utf-8');

    // 3. Resolve student identity from hint
    const hint = entry.studentHint;
    const studentId = hint?.studentId ?? null;
    const studentName =
      hint?.fullName ??
      (await guessStudentNameFromMarkdown(ocrMarkdown)) ??
      entry.fileName;

    const artifactId = `artifact-${input.documentId}`;
    const title = studentName;

    if (writer) {
      await writer.write({
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'processing', content: '', title, id: artifactId }
      } as never);
    }

    // 4. Re-format via document agent
    const documentAgent = await getDocumentAgent();
    const prompt = [
      `Format the following OCR-extracted academic result for ${studentName} into clean, well-structured markdown.`,
      'Preserve every factual value, subject name, score, and grade from the input.',
      'Render it as an academic report card that a parent can read at a glance.',
      '',
      '```markdown',
      ocrMarkdown,
      '```'
    ].join('\n');

    const stream = await streamWithAutoRetry({
      stream: () =>
        documentAgent.stream(prompt, {
          ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
          ...(context.requestContext ? { requestContext: context.requestContext as never } : {})
        }),
      abortSignal: context.abortSignal,
      writer: writer ?? { write: async () => {} }
    });

    let markdown = '';
    for await (const chunk of stream.textStream) {
      if (typeof chunk !== 'string' || chunk.length === 0) continue;
      markdown += chunk;
      if (writer) {
        await writer.write({
          type: 'data-createDocument',
          id: artifactId,
          data: { status: 'streaming', content: markdown, title, id: artifactId }
        } as never);
      }
    }

    if (writer) {
      await writer.write({
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'success', content: markdown, title, id: artifactId }
      } as never);
    }

    // 5. Persist to canonical path
    const persistPath =
      studentId !== null
        ? marksheetMarkdownPath(studentId, studentName)
        : `marksheets/ocr-${input.documentId}.md`;
    await fs.writeFile(persistPath, markdown, { recursive: true });

    // 6. Register in new manifest
    await addEntry(tenant, {
      path: persistPath,
      kind: 'marksheet-markdown',
      studentId: studentId ?? undefined,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      mimeType: 'text/markdown'
    });

    // 7. Set formatArtifactState for awaitValidationStep resume
    if (context.requestContext) {
      context.requestContext.set('formatArtifactState', {
        documentId: input.documentId,
        artifactId,
        persistPath,
        title,
        studentHint: hint ?? null
      });
    }

    return {
      artifactId,
      title,
      markdown,
      persistPath,
      studentId,
      status: 'success' as const
    };
  }
});

/**
 * Best-effort guess at the student's name from OCR markdown.
 * Looks for lines starting with "Student:", "Name:", or containing a capitalized name in the first 10 lines.
 */
async function guessStudentNameFromMarkdown(md: string): Promise<string | null> {
  const lines = md.split('\n').slice(0, 10);
  for (const line of lines) {
    const match = line.match(/^\s*(?:Student|Name)\s*:\s*(.+)/i);
    if (match && match[1]) {
      const name = match[1].trim();
      if (name.length > 0 && name.length < 100) return name;
    }
  }
  return null;
}
