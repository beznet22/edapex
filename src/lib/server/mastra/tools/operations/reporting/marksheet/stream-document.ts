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
import { appendFileSync } from 'fs';
import { streamWithAutoRetry, type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { readManifest as readWorkspaceManifest, addEntry, updateEntryStatus } from '$lib/server/workspace/manifest';
import { ocrMarkdownPath } from '$lib/server/workspace/paths';
import {
  getTenant,
  getWriter,
  resolveFilesystem
} from '../_shared';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { getClassRoster } from '$lib/server/mastra/agents/skill-instructions';

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

    const { title, initialMarkdownPath } = deriveInitialFilename(entry.fileName, contentHash);

    const mdRelPath = ocrMarkdownPath(entry.fileName, tenant.examTypeId);
    if (!(await fs.exists(mdRelPath))) {
      throw new Error(`OCR_MARKDOWN_NOT_FOUND: ${mdRelPath}`);
    }
    const raw = await fs.readFile(mdRelPath, { encoding: 'utf-8' });
    const ocrMarkdown = typeof raw === 'string' ? raw : raw.toString('utf-8');

    const studentId = entry.studentId ?? null;
    const artifactId = `artifact-${documentId}`;

    // Fetch subject mapping + roster for context
    const assessment = await createAssessmentServiceForRequest(tenant);
    const mapping = await assessment.getMappingData(
      tenant.staffId,
      tenant.classId ?? undefined,
      tenant.sectionId ?? undefined
    );

    const examTypeTitle = Array.isArray(mapping.examTypes)
      ? mapping.examTypes[0]?.title
      : (mapping.examTypes as Record<string, unknown>)?.title ?? '';

    const roster = await getClassRoster({
      classId: tenant.classId ?? undefined,
      sectionId: tenant.sectionId ?? undefined,
      academicId: tenant.academicId ?? undefined,
    });
    const rosterLines = roster
      .map((r) => `  - ${r.name}${r.admissionNo ? ` (Adm#${r.admissionNo})` : ''}`)
      .join('\n');

    const subjectLines = mapping.subjects
      .filter((s) => s.id && s.subjectCode)
      .map((s) => `  - ${s.subjectCode}`)
      .join('\n');

    const CATEGORY_COLS = `DAYCARE: Subject Code | Learning Outcome
NURSERY: Subject Code | CA (30) | ORAL (5) | PSYCHO (5) | HW (10) | EXAM (50)
GRADEK: Subject Code | CA1 (20) | CA2 (20) | HW (2) | REPORT (4) | PSYCHO (4) | EXAM (50)
LOWERBASIC: Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50)
MIDDLEBASIC: Subject Code | MTA (30) | CA (10) | REPORT (10) | EXAM (50)`;

    const prompt = [
      'Format this OCR into a strict marksheet markdown.',
      'Use the context below to fill in the correct values as plain text (no spans).',
      '',
      '# FullName — ExamTitle',
      '',
      '## Student Information (| Field | Details |)',
      'Full Name, Admission No, Class, Section, Category, Term, Academic Year, Days Open, Days Present, Days Absent',
      '',
      '## Academic Performance (single table, subjects as rows)',
      'Infer category, pick columns:',
      CATEGORY_COLS,
      'No Total/Grade rows. DAYCARE must include Learning Outcome column. Use exact Title (Max) format.',
      '',
      "## Learner's Rating (| Trait | Rating | 1-5)",
      'Traits: Adherent and independent, Flexibility and creativity, Meticulous, Neatness, Self-control and interaction, Overall progress.',
      '',
      '## Teacher\'s Remark',
      '> blockquote',
      '',
      'No markdown fences, no commentary.',
      '',
       '--- CONTEXT ---',
      `Class: ${tenant.className ?? ''} (id=${tenant.classId ?? ''})`,
      `Section: ${tenant.sectionName ?? ''} (id=${tenant.sectionId ?? ''})`,
      `Term: ${examTypeTitle || tenant.examTypeId || ''}`,
      `Academic Year: ${tenant.academicYearTitle ?? ''}`,
      '',
      'STUDENT ROSTER (admissionNo here is AUTHORITATIVE):',
      rosterLines || '  (no roster available)',
      'Match the student Full Name from the OCR to this roster, then use the roster admissionNo in the Admission No field — NOT the value from the OCR.',
      '',
      'SUBJECT CODES:',
      subjectLines || '  (no subjects available)',
      '',
      '--- OCR INPUT ---',
      ocrMarkdown,
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
          ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
          providerOptions: { deepseek: { thinking: 'none' } }
        }),
      abortSignal: context.abortSignal,
      writer: writer ?? { write: async () => {} }
    });

    let markdown = '';
    let chunkCount = 0;
    for await (const chunk of stream.textStream) {
      if (typeof chunk !== 'string' || chunk.length === 0) continue;
      markdown += chunk;
      chunkCount++;
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
    console.log('[streamDocument-DIAG]', { documentId, chunkCount, markdownLength: markdown.length });
    console.log('[streamDocument-DIAG]', { documentId, chunkCount, markdownLength: markdown.length });
    try {
      appendFileSync(
        '/home/beznet/Workspace/edapex/stream-document-diag.log',
        JSON.stringify({ at: new Date().toISOString(), side: 'emit', documentId, chunkCount, markdownLength: markdown.length }) + '\n'
      );
    } catch { /* diagnostics — never block the pipeline */ }

    // Write the ORPHAN DRAFT to disk so the file exists for cross-session
    // continuity (clicking ArtifactCard after a refresh must find the
    // file at initialMarkdownPath; without this write, only the editor's
    // auto-save would create it, which doesn't fire until the user types).
    // The CANONICAL file (ADM<adminNo>-<examTypeId>-<studentName>.md) is still
    // only written by validate-marksheet after user verification — see
    // `validate-marksheet.ts`, which renames this draft away.
    const formattedDocumentId = entry.documentId ?? documentId;
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
    await updateEntryStatus(tenant, initialMarkdownPath, 'formatted');

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
