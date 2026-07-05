/**
 * Document Stream Workflow — EdApex
 *
 * Server-side workflow that formats a marksheet OCR upload or a student
 * transcript into structured markdown. Registered on `assistantAgent` via
 * `workflows: { streamDocument: documentStreamWorkflow }` so Mastra exposes
 * it as a tool named `workflow-streamDocument`. The assistant calls it as
 * a regular tool; the step runs server-side, emits each LLM text-delta
 * chunk as a `data-streamDocument` data part via `writer.custom` for the
 * client to render token-by-token, persists the final markdown to the
 * workspace, and returns the artifact metadata via the output schema.
 *
 * Supports two formats via the `format` input param:
 *
 *   - `marksheet`: stream formatted markdown for an OCR upload (contentHash).
 *     Reads `ocr/<fileName>.md`, calls the document agent, persists to
 *     `marksheets/<contentHash>.md`.
 *
 *   - `transcript`: stream formatted markdown for a student's multi-term
 *     transcript (studentId + academicId). Fetches transcript data via
 *     AssessmentService.getTranscript, calls the document agent, persists
 *     to `transcripts/<studentId>.md`.
 *
 * The client renders the streamed markdown token-by-token using the same
 * text-part loop pattern as chat.svelte.
 */
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { streamWithAutoRetry } from '../agent-stream-retry';
import { addEntry, readManifest as readWorkspaceManifest } from '$lib/server/mastra/storage/workspaces/manifest-store';
import { ocrMarkdownPath, transcriptMarkdownPath } from '$lib/server/mastra/storage/workspaces/paths';
import { resolveStudent } from '../tools/operations/reporting/_shared';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';
import type { TenantContext } from '../tenant-context';

export const documentStreamInputSchema = z.object({
  format: z.enum(['marksheet', 'transcript']).default('marksheet'),
  contentHash: z.string().optional(),
  fileName: z.string().optional(),
  studentId: z.number().int().positive().optional(),
  academicId: z.number().int().positive().optional(),
  threadId: z.string().optional(),
  promptText: z.string().optional()
});

export const documentStreamOutputSchema = z.object({
  format: z.enum(['marksheet', 'transcript']),
  artifactId: z.string(),
  contentHash: z.string(),
  fileName: z.string(),
  filePath: z.string(),
  title: z.string(),
  studentId: z.number().nullable()
});

/**
 * Derives a deterministic documentId from the workflow input. The client
 * uses the same derivation to match `data-streamDocument` deltas to entries
 * in `threadData.documentStreams` without needing access to a `toolCallId`.
 */
function deriveDocumentId(input: z.infer<typeof documentStreamInputSchema>): string {
  if (input.format === 'transcript') {
    return `transcript-${input.studentId}-${input.academicId ?? 'active'}`;
  }
  return `marksheet-${input.contentHash}`;
}

export const streamDocumentAgentStep = createStep({
  id: 'stream-document-agent',
  inputSchema: documentStreamInputSchema,
  outputSchema: documentStreamOutputSchema,
  retries: 3,
  execute: async ({ inputData, mastra: m, requestContext, writer, abortSignal }) => {
    const tenant = requestContext?.get('tenantContext') as TenantContext | undefined;
    if (!tenant) {
      throw new Error('TENANT_CONTEXT_REQUIRED: streamDocumentAgentStep requires tenantContext');
    }

    const documentAgent = m?.getAgent('document');
    if (!documentAgent) {
      throw new Error('AGENT_NOT_REGISTERED: document agent not registered on Mastra instance');
    }

    const workspaceRc = buildWorkspaceRequestContext(tenant);
    const fs = (await tenantWorkspace.resolveFilesystem({ requestContext: workspaceRc as never })) as WorkspaceFilesystem | null;
    if (!fs) {
      throw new Error('WORKSPACE_UNAVAILABLE: tenant workspace filesystem not configured');
    }

    if (inputData.format === 'transcript') {
      if (!inputData.studentId) {
        throw new Error('STUDENT_ID_REQUIRED: transcript format requires studentId');
      }
      const student = await resolveStudent(
        tenant,
        { studentId: inputData.studentId },
        tenant.classId,
        tenant.sectionId
      );
      const academicId = inputData.academicId ?? tenant.academicId ?? student.academicId ?? null;
      if (academicId === null) {
        throw new Error('ACADEMIC_ID_REQUIRED: no academicId in input, tenant, or student record');
      }
      const assessment = await createAssessmentServiceForRequest(tenant);
      const transcript = await assessment.getTranscript({
        studentId: student.studentId,
        academicId,
        withImages: false
      });
      if (transcript === null) {
        throw new Error(`TRANSCRIPT_NOT_FOUND: no transcript data for studentId=${student.studentId} academicId=${academicId}`);
      }

      const studentName = student.fullName ?? 'Student';
      const academicYearTitle = (transcript as { academicYear?: { title?: string } }).academicYear?.title ?? String(academicId);
      const artifactId = `artifact-transcript-${student.studentId}-${academicId}`;
      const title = `${studentName} — Transcript ${academicYearTitle}`;
      const persistPath = transcriptMarkdownPath(student.studentId);

      const prompt = [
        `Format this multi-term academic transcript for ${studentName} into clean, well-structured markdown.`,
        '',
        'Render a table with columns: Subject, Term 1, Term 2, Term 3, Total, Grade.',
        'Below the table, write a one-paragraph "Year Overview" summary of the student\'s yearly performance, their position relative to the class average, and any notable trends across the three terms.',
        '',
        'Preserve every factual value, subject name, score, and grade from the JSON below.',
        'Use proper markdown headings (# ## ###), lists, tables, and emphasis where appropriate.',
        '',
        '```json',
        JSON.stringify(transcript, null, 2),
        '```'
      ].join('\n');

      const stream = await streamWithAutoRetry({
        stream: () =>
          documentAgent.stream(prompt, {
            ...(abortSignal ? { abortSignal: abortSignal as AbortSignal } : {}),
            ...(requestContext ? { requestContext: requestContext as never } : {})
          }),
        abortSignal: abortSignal as AbortSignal | undefined,
        writer: writer as unknown as { write: (chunk: unknown) => Promise<void> }
      });

      for await (const chunk of stream.fullStream) {
        if (chunk.type === 'text-delta' && typeof chunk.payload?.text === 'string') {
          await writer.custom({
            type: 'data-streamDocument',
            data: {
              documentId: deriveDocumentId(inputData),
              format: 'transcript',
              phase: 'delta',
              delta: chunk.payload.text
            },
            transient: true
          });
        }
      }
      const finalText = await stream.text;

      await fs.writeFile(persistPath, finalText, { recursive: true });
      const now = new Date().toISOString();
      await addEntry(tenant, {
        path: persistPath,
        kind: 'transcript-markdown',
        studentId: student.studentId,
        academicId,
        uploadedAt: now,
        modifiedAt: now,
        mimeType: 'text/markdown'
      });

      return {
        format: 'transcript' as const,
        artifactId,
        contentHash: '',
        fileName: 'Transcript',
        filePath: persistPath,
        title,
        studentId: student.studentId
      };
    }

    // marksheet branch
    const { contentHash, fileName } = inputData;
    if (!contentHash) {
      throw new Error('CONTENT_HASH_REQUIRED: marksheet format requires contentHash');
    }
    if (!fileName) {
      throw new Error('FILE_NAME_REQUIRED: marksheet format requires fileName');
    }

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
    const studentName = fileName;
    const formattedDocumentId = entry.documentId ?? randomUUID();
    const artifactId = `artifact-${formattedDocumentId}`;
    const title = studentName;
    const persistPath = `marksheets/${contentHash}.md`;

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
          ...(abortSignal ? { abortSignal: abortSignal as AbortSignal } : {}),
          ...(requestContext ? { requestContext: requestContext as never } : {})
        }),
      abortSignal: abortSignal as AbortSignal | undefined,
      writer: writer as unknown as { write: (chunk: unknown) => Promise<void> }
    });

    for await (const chunk of stream.fullStream) {
      if (chunk.type === 'text-delta' && typeof chunk.payload?.text === 'string') {
        await writer.custom({
          type: 'data-streamDocument',
          data: {
            documentId: deriveDocumentId(inputData),
            format: 'marksheet',
            phase: 'delta',
            delta: chunk.payload.text
          },
          transient: true
        });
      }
    }
    const finalText = await stream.text;

    await fs.writeFile(persistPath, finalText, { recursive: true });
    const now = new Date().toISOString();
    await addEntry(tenant, {
      path: persistPath,
      kind: 'marksheet-markdown',
      documentId: formattedDocumentId,
      fileName: entry.fileName,
      contentHash,
      studentId: studentId ?? undefined,
      uploadedAt: now,
      modifiedAt: now
    });

    return {
      format: 'marksheet' as const,
      artifactId,
      contentHash,
      fileName: entry.fileName,
      filePath: persistPath,
      title,
      studentId
    };
  }
});

export const documentStreamWorkflow = createWorkflow({
  id: 'documentStreamWorkflow',
  description:
    "Format a marksheet OCR upload or transcript into structured markdown and stream it token-by-token to the workspace panel. ALWAYS call this tool — never format marksheets in your text response. Required inputs: format (marksheet|transcript); for marksheet pass contentHash + fileName; for transcript pass studentId + academicId (academicId defaults to the active academic year).",
  inputSchema: documentStreamInputSchema,
  outputSchema: documentStreamOutputSchema,
  retryConfig: { attempts: 2, delay: 1000 }
})
  .then(streamDocumentAgentStep)
  .commit();
