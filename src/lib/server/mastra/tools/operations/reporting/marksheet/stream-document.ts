/**
 * Stream Document Tool — EdApex
 *
 * Server-side tool that formats a marksheet OCR upload into structured
 * markdown and streams it token-by-token to the workspace panel via
 * `data-streamDocument` data parts. Registered on `assistantAgent` via
 * `tools:` (merged into the dynamic toolset in `agents/assistant.ts`).
 *
 * STREAM-ONLY: this tool does NOT write to disk. It streams the formatted
 * markdown through `data-streamDocument` parts and returns rich metadata
 * (`title`, `initialMarkdownPath`, etc.) for the client to render. The
 * client (artifact editor panel) auto-saves to `initialMarkdownPath` while
 * the user edits; `validate-marksheet` is responsible for renaming the
 * draft to the canonical `marksheets/ADM<adminNo>-<examTypeId>-<studentName>.md`
 * path and updating the manifest once the user verifies and validation
 * passes. See `validate-marksheet.ts` and `paths.ts`.
 *
 * WHY A TOOL (NOT A WORKFLOW): Tools' `context.writer.custom(data)` writes
 * the chunk directly to the agent's stream controller (see the agent's
 * `outputWriter` in node_modules/@mastra/core/dist/chunk-QPZ35KK2.cjs
 * around the dataChunkStreamWriter block). That controller enqueues the
 * data-* chunk as-is, so the AI SDK chat transport surfaces it as a
 * `data-streamDocument` data part on the client. A workflow step's
 * `writer.custom()` instead routes through the workflow's pubsub → watch
 * callback → workflow stream. When the workflow is invoked as a tool, the
 * resulting events get re-wrapped twice (once as a workflow event, once by
 * the outer chat workflow), and the chat endpoint's transformer only
 * unwraps once — the inner `data-*` type never reaches the client.
 *
 * Note: transcripts are handled by the dedicated
 * `transcript-report` tool in `./transcript/transcript-report.ts`.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { streamWithAutoRetry, type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { readManifest as readWorkspaceManifest, addEntry } from '$lib/server/mastra/storage/workspaces/manifest-store';
import { ocrMarkdownPath } from '$lib/server/mastra/storage/workspaces/paths';
import {
  getTenant,
  getWriter,
  resolveFilesystem
} from '../_shared';

const streamDocumentInputSchema = z.object({
  contentHash: z.string().describe('The contentHash of the OCR upload (also shown as fileId in the FILE MANIFEST).'),
  fileName: z.string().describe('The original filename of the marksheet image/PDF.')
});

const streamDocumentOutputSchema = z.object({
  artifactId: z.string(),
  contentHash: z.string(),
  fileName: z.string(),
  initialMarkdownPath: z.string().describe('Filename-derived path the editor panel auto-saves to during editing, e.g. "marksheets/adakole-a1b2c3d4.md". Renamed to the canonical ADM<adminNo>-<examTypeId>-<studentName>.md path by validate-marksheet after validation.'),
  title: z.string().describe('Working title derived from the uploaded filename (e.g., "adakole"). Replaced by `${student.fullName} — ${examType.title}` after validate-marksheet succeeds.'),
  studentId: z.number().nullable(),
  documentId: z.string().describe('UUID minted per upload; serves as the marksheet documentId for downstream tools.'),
  examTypeId: z.number().nullable().describe('Resolved from tenant.examTypeId; null if not yet set.'),
  academicId: z.number().nullable().describe('Resolved from tenant.academicId; null if not yet set.'),
  studentFullName: z.string().nullable().describe('Resolved from the manifest user-file entry if a student link already exists; null otherwise. Becomes available after validate-marksheet re-derives the JSON.'),
  adminNo: z.number().nullable().describe('Resolved from the student record if linked; null otherwise.')
});

/**
 * Mirrors the client-side `deriveDocumentId` in `thread-data.svelte.ts`.
 * Used by both client and server so deltas emitted via `data-streamDocument`
 * reconcile to the same key without needing a toolCallId round-trip.
 */
export function deriveDocumentId(input: { contentHash: string }): string {
  return `marksheet-${input.contentHash}`;
}

/**
 * Derives the working title and the editor's auto-save path from the
 * uploaded filename. Both are deterministic functions of `fileName` and
 * `contentHash` — no LLM call, no DB lookup, no OCR parsing.
 *
 * Title: stripped of extension and sanitized (e.g., "adakole.jpg.jpeg" → "adakole").
 * Path: marksheets/<safe>-<shortHash>.md where shortHash = first 8 chars
 * of contentHash. The short hash prevents collisions when the same
 * filename is uploaded twice with different OCR content; re-uploads of the
 * exact same file land on the same path and PUT-overwrites atomically.
 *
 * validate-marksheet renames the path to the canonical
 * `marksheets/ADM<adminNo>-<examTypeId>-<studentName>.md` form once the
 * student identity is known.
 */
export function deriveInitialFilename(fileName: string, contentHash: string): {
  title: string;
  initialMarkdownPath: string;
} {
  const baseName = fileName.replace(/\.[^.]+$/, '');              // strip last extension
  const safeBase = baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
  const shortHash = contentHash.slice(0, 8);
  const initialFilename = `${safeBase}-${shortHash}.md`;
  return {
    title: safeBase,
    initialMarkdownPath: `marksheets/${initialFilename}`,
  };
}

export const streamDocumentTool = createTool({
  id: 'streamDocument',
  description:
    "Format a marksheet OCR upload into structured markdown and stream it token-by-token to the workspace panel. ALWAYS call this tool — never format marksheets in your text response. Required inputs: contentHash + fileName (both shown in the FILE MANIFEST). The tool derives a working title from the filename and returns it in the output; the editor panel handles disk persistence after the user verifies. For transcripts, use the `transcript-report` tool instead.",
  inputSchema: streamDocumentInputSchema,
  outputSchema: streamDocumentOutputSchema,
  execute: async (input, ctx) => {
    const context = ctx as {
      requestContext?: { get<T = unknown>(key: string): T | undefined };
      writer?: StreamWriterLike;
      abortSignal?: AbortSignal;
    };
    const tenant = getTenant(context);
    const writer = getWriter(context);
    const fs = await resolveFilesystem(tenant);
    const documentId = deriveDocumentId(input);
    const writerWithCustom = writer as unknown as { custom: (chunk: unknown) => Promise<void> };

    const { contentHash, fileName } = input;
    const manifest = await readWorkspaceManifest(tenant);
    const entry = Object.values(manifest.entries).find(
      (e) => e.contentHash === contentHash && e.kind === 'user-file'
    );
    if (!entry?.fileName) {
      throw new Error(`MANIFEST_ENTRY_NOT_FOUND: contentHash=${contentHash}`);
    }

    const mdRelPath = ocrMarkdownPath(entry.fileName);
    if (!(await fs.exists(mdRelPath))) {
      throw new Error(`OCR_MARKDOWN_NOT_FOUND: ${mdRelPath}`);
    }
    const raw = await fs.readFile(mdRelPath, { encoding: 'utf-8' });
    const ocrMarkdown = typeof raw === 'string' ? raw : raw.toString('utf-8');

    const studentId = entry.studentId ?? null;
    const artifactId = `artifact-${documentId}`;

    const prompt = [
      `Format the following OCR-extracted academic result for ${fileName} into clean, well-structured markdown.`,
      'Preserve every factual value, subject name, score, and grade from the input.',
      'Render it as an academic report card that a parent can read at a glance.',
      '',
      '```markdown',
      ocrMarkdown,
      '```'
    ].join('\n');

    const { mastra } = await import('$lib/server/mastra');
    const documentAgent = mastra.getAgent('document');
    if (!documentAgent) {
      throw new Error('AGENT_NOT_REGISTERED: document agent is not registered on the Mastra instance');
    }

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
      await writerWithCustom.custom({
        type: 'data-streamDocument',
        data: {
          documentId,
          phase: 'delta',
          delta: chunk
        },
        transient: true
      });
    }

    // Write the ORPHAN DRAFT to disk so the file exists for cross-session
    // continuity (clicking ShimmerArtifactCard after a refresh must find the
    // file at initialMarkdownPath; without this write, only the editor's
    // auto-save would create it, which doesn't fire until the user types).
    // The CANONICAL file (ADM<adminNo>-<examTypeId>-<studentName>.md) is still
    // only written by validate-marksheet after user verification — see
    // `validate-marksheet.ts`, which renames this draft away.
    const formattedDocumentId = entry.documentId ?? documentId;
    const { title, initialMarkdownPath } = deriveInitialFilename(entry.fileName, contentHash);
    await fs.writeFile(initialMarkdownPath, markdown, { recursive: true });
    await addEntry(tenant, {
      path: initialMarkdownPath,
      kind: 'marksheet-markdown',
      documentId: formattedDocumentId,
      fileName: entry.fileName,
      contentHash,
      studentId: studentId ?? undefined,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString()
    });

    return {
      artifactId,
      documentId,
      contentHash,
      fileName: entry.fileName,
      initialMarkdownPath,
      title,
      studentId,
      examTypeId: tenant.examTypeId ?? null,
      academicId: tenant.academicId ?? null,
      studentFullName: null,
      adminNo: null,
    };
  }
});
