import { createTool } from '@mastra/core/tools';
import type { ToolStream } from '@mastra/core/tools';
import { z } from 'zod';
import { randomUUID } from 'crypto';
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
  writer?: ToolStream | StreamWriterLike;
  abortSignal?: AbortSignal;
}

/**
 * Emit a data-* stream part. When the tool is invoked by an agent, the
 * writer is a ToolStream and we MUST use writer.custom(). When the tool is
 * called directly from a workflow step, the writer is a StreamChunkWriter
 * and we use writer.write().
 */
async function emitDataPart(
  writer: ToolStream | StreamWriterLike | undefined,
  part: { type: `data-${string}`; id?: string; data: unknown }
): Promise<void> {
  if (!writer) return;
  if ('custom' in writer && typeof (writer as ToolStream).custom === 'function') {
    await (writer as ToolStream).custom(part);
  } else {
    await (writer as StreamWriterLike).write(part as never);
  }
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

export const streamDocumentTool = createTool({
  id: 'stream-document',
  description:
    'CENTRAL ARTIFACT GENERATOR. Transforms raw OCR markdown into clean, ' +
    'human-readable, structured markdown and streams it token-by-token to ' +
    'the workspace panel. ' +
    '\n\n' +
    'WHEN TO CALL: ' +
    'After an OCR upload produces a marksheet, transcript, or other ' +
    'academic document that needs to be cleaned up and rendered to the ' +
    'user. The user typically asks "process this marksheet", "extract the ' +
    'marks", "show me the formatted document", etc. ' +
    '\n\n' +
    'WHAT IT DOES: ' +
    '1. Resolves the contentHash (OCR upload id) against the workspace ' +
    '   manifest.json at workspace root). ' +
    '2. Reads the OCR markdown from ocr/<fileName>.md. ' +
    '3. Calls the document sub-agent which streams formatted markdown ' +
    '   token-by-token. ' +
    '4. Emits `data-createDocument` stream parts (status: processing ' +
    '   \u2192 streaming \u2192 success) which auto-open the workspace panel ' +
    '   and render the content via <Markdown>. ' +
    '5. Persists the formatted markdown to the canonical workspace path ' +
    '   (e.g. marksheets/<studentId>-<slug>.md or ' +
    '   marksheets/ocr-<documentId>.md if student identity is unknown). ' +
    '6. Registers the artifact in the workspace manifest. ' +
    '\n\n' +
    'RETURNS: ' +
    '{ artifactId, title, markdown, persistPath, studentId, status }. ' +
    '\n\n' +
    'FOLLOW-UP: ' +
    'After this tool returns, the workflow auto-suspends for validation ' +
    '(awaitValidationStep). The user clicks the Validate pill in the ' +
    'ActionBar to commit the marksheet or apply auto-fix. ' +
    '\n\n' +
    'NOTE: This tool is the SINGLE source of truth for streaming ' +
    'document content. Do not call any other tool that streams the same ' +
    'content\u2014that would cause duplicate data-createDocument parts. ' +
    'For PDFs and transcripts, the equivalent tool is publish-result-pdf ' +
    'or generate-transcript-pdf respectively.',
  inputSchema: z.object({
    contentHash: z.string().describe('The contentHash / fileId of the OCR upload to format. This is the ID shown in the FILE MANIFEST (e.g. 0adbef757d8c14d65e873f54d0fbd049), NOT the doc-... documentId which is created only after the formatted marksheet exists.')
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
    console.log('[stream-document] execute called', { contentHash: input.contentHash, hasWriter: !!context.writer, hasReqCtxWriter: !!context.requestContext?.get('writer') });
    const tenant = getTenant(context);
    // The workflow step passes writer directly when calling tool.execute();
    // when the assistant agent invokes the tool, Mastra forwards
    // requestContext but not the step's writer. We stash it in
    // requestContext in assistantStep so streaming still reaches the client.
    const writer = context.writer ?? context.requestContext?.get('writer') as StreamWriterLike | undefined;

    // 1. Find the OCR upload entry by contentHash in the single workspace
    // manifest. The legacy `extracted/manifest.json` is no longer used.
    // contentHash is the upload's stable fingerprint and is what the
    // FILE MANIFEST exposes to the assistant. documentId is minted later
    // for the formatted marksheet, not the raw upload.
    const manifest = await readWorkspaceManifest(tenant);
    const entry = Object.values(manifest.entries).find(
      (e) => e.contentHash === input.contentHash && e.kind === 'user-file'
    );
    if (!entry || !entry.fileName) {
      console.log('MANIFEST_ENTRY_NOT_FOUND: contentHash=', input.contentHash);
      throw new Error(
        `MANIFEST_ENTRY_NOT_FOUND: contentHash=${input.contentHash} is not a raw OCR upload in the workspace manifest`
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

    // 3. Resolve student identity from manifest entry (single source of truth).
    // The manifest entry carries studentId when the user @mentioned a student;
    // otherwise student identity is resolved later during validation HITL.
    const studentId = entry.studentId ?? null;
    const studentName =
      (await guessStudentNameFromMarkdown(ocrMarkdown)) ?? entry.fileName;

    // Mint a documentId for the formatted marksheet. This id is created
    // AFTER the first clean document is saved and is used for later edits
    // (validate/auto-fix/link) when the student is still unknown.
    const formattedDocumentId = entry.documentId ?? randomUUID();
    const artifactId = `artifact-${formattedDocumentId}`;
    const title = studentName;

    if (writer) {
      console.log('[stream-document] emitting processing', { artifactId, title });
      await emitDataPart(writer, {
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'processing', content: '', title, id: artifactId }
      });
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
      writer: writer ?? { write: async () => { } }
    });

    let markdown = '';
    for await (const chunk of stream.textStream) {
      if (typeof chunk !== 'string' || chunk.length === 0) continue;
      markdown += chunk;
      if (writer) {
        await emitDataPart(writer, {
          type: 'data-createDocument',
          id: artifactId,
          data: { status: 'streaming', content: markdown, title, id: artifactId }
        });
      }
    }

    if (writer) {
      console.log('[stream-document] emitting success', { artifactId, title, contentLength: markdown.length });
      await emitDataPart(writer, {
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'success', content: markdown, title, id: artifactId }
      });
    }

    // 5. Persist to canonical path
    const persistPath =
      studentId !== null
        ? marksheetMarkdownPath(studentId, studentName)
        : `marksheets/ocr-${formattedDocumentId}.md`;
    await fs.writeFile(persistPath, markdown, { recursive: true });

    // 6. Register the formatted marksheet in the manifest with its own
    // documentId. This is the id that later editing tools target.
    await addEntry(tenant, {
      path: persistPath,
      kind: 'marksheet-markdown',
      documentId: formattedDocumentId,
      studentId: studentId ?? undefined,
      contentHash: input.contentHash,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      mimeType: 'text/markdown'
    });

    // 7. Set formatArtifactState + lastFormattedDocumentId for
    // awaitValidationStep resume. The workflow reads lastFormattedDocumentId
    // to build the artifactId in data-awaitValidation.
    if (context.requestContext) {
      context.requestContext.set('formatArtifactState', {
        documentId: formattedDocumentId,
        contentHash: input.contentHash,
        artifactId,
        persistPath,
        title,
        studentId
      });
      context.requestContext.set('lastFormattedDocumentId', formattedDocumentId);
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
