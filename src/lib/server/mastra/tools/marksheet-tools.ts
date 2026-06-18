/**
 * Marksheet Tools — EdApex Chat Workflow
 *
 * Five tools that the assistant agent invokes when the user types `/marksheet`
 * or `/validate`. They orchestrate the marksheet artifact lifecycle:
 * read extracted JSON → format as markdown → validate → auto-fix → commit to
 * the academic record. Every step that touches a UI surface emits
 * `data-createDocument` (format) or `data-committed` (commit) stream parts
 * via the tool context's `writer`, mirroring the parts the chat workflow
 * already speaks.
 *
 * The `data-createDocument` and `data-committed` part types are emitted via
 * `writer.write(... as never)` because the canonical `xDataPart` union lives
 * in another subagent's scope (chat-types.ts). The downstream UI filters on
 * `part.type === 'data-createDocument'` and `part.id === <artifactId>`, and
 * on `part.type === 'data-committed'`, so the shape here is what the UI
 * already consumes elsewhere.
 */
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { streamWithAutoRetry, type StreamWriterLike } from '../agent-stream-retry';
import { tenantWorkspace } from '../storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { readManifest, type ManifestEntry } from '../storage/ocr/manifest-store';
import { writeBlob } from '../storage/ocr/content-addressed-blob';
import { removeCommittedDocument } from '../storage/ocr/extracted-cleanup';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { marksheetSchema, type Marksheet } from '$lib/schema/marksheet';
import type { TenantContext } from '../tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

const EXTRACTED_JSON_PATH = (documentId: string): string => `extracted/${documentId}.json`;

async function getDocumentAgent() {
  const { mastra } = await import('../index');
  const agent = mastra.getAgent('document');
  if (!agent) {
    throw new Error('AGENT_NOT_REGISTERED: document agent is not registered on the Mastra instance');
  }
  return agent;
}

// ─── Context Helpers ────────────────────────────────────────────────────────

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

async function writeExtractedJson(
  tenant: TenantContext,
  documentId: string,
  json: unknown,
): Promise<void> {
  const fs = await resolveTenantFilesystem(tenant);
  await fs.writeFile(
    EXTRACTED_JSON_PATH(documentId),
    JSON.stringify(json, null, 2),
    { recursive: true },
  );
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

// ─── Schemas ────────────────────────────────────────────────────────────────

const marksheetErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string(),
});

const appliedFixSchema = z.object({
  path: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  explanation: z.string(),
});

const unresolvedErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  whyCannotFix: z.string(),
});

const fixOutputSchema = z.object({
  reasoning: z.string(),
  appliedFixes: z.array(appliedFixSchema),
  unresolvedErrors: z.array(unresolvedErrorSchema),
  fixedJson: z.record(z.string(), z.unknown()),
});

// ─── Tool 1: get-active-marksheet ───────────────────────────────────────────

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

// ─── Tool 2: format-marksheet-document ──────────────────────────────────────

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
    }

    return { artifactId, title, markdown, status: 'success' as const };
  },
});

// ─── Tool 3: validate-marksheet ─────────────────────────────────────────────

export const validateMarksheetTool = createTool({
  id: 'validate-marksheet',
  description:
    'Re-derive the JSON from the current markdown via the document agent, ' +
    'then run marksheetSchema.safeParse. The correctedMarkdown is read from the workspace.',
  inputSchema: z.object({
    documentId: z.string().describe('The documentId whose JSON should be re-derived and validated.'),
    correctedMarkdown: z.string().describe('The user-corrected markdown to re-derive JSON from.'),
  }),
  outputSchema: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true) }),
    z.object({
      ok: z.literal(false),
      errors: z.array(marksheetErrorSchema),
    }),
  ]),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);
    void tenant;

    const documentAgent = await getDocumentAgent();

    const prompt = [
      'Re-derive the structured academic result JSON from the following markdown.',
      'Emit ONLY the JSON object that conforms to the Marksheet schema (school, student, subjects, records, score, ratings, remark, examType).',
      '',
      '```markdown',
      input.correctedMarkdown,
      '```',
    ].join('\n');

    const response = await documentAgent.generate(prompt, {
      ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
      ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
      structuredOutput: { schema: marksheetSchema },
    });

    const reDerivedJson: unknown =
      (response as { object?: unknown }).object ?? (() => {
        const text = (response as { text?: string }).text ?? '';
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      })();

    if (reDerivedJson === null || reDerivedJson === undefined) {
      throw new Error('STRUCTURED_OUTPUT_EMPTY: document agent returned neither object nor parseable text');
    }

    await writeExtractedJson(tenant, input.documentId, reDerivedJson);

    const parsed = marksheetSchema.safeParse(reDerivedJson);
    if (parsed.success) {
      return { ok: true as const };
    }

    return {
      ok: false as const,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code,
      })),
    };
  },
});

// ─── Tool 4: auto-fix-marksheet ─────────────────────────────────────────────

export const autoFixMarksheetTool = createTool({
  id: 'auto-fix-marksheet',
  description:
    'Apply mechanical fixes to the JSON at ≥80% confidence. Writes the fixed JSON to disk ' +
    'and re-emits the document via data-createDocument (processing → streaming → success).',
  inputSchema: z.object({
    documentId: z.string().describe('The documentId whose JSON should be auto-fixed.'),
    errors: z.array(marksheetErrorSchema).describe('Validation errors that need fixing.'),
    currentMarkdown: z.string().describe('The markdown the user has been reviewing.'),
  }),
  outputSchema: z.object({
    appliedFixes: z.array(appliedFixSchema),
    unresolvedErrors: z.array(unresolvedErrorSchema),
    reStreamedArtifactId: z.string().nullable(),
  }),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);
    const writer = getWriter(context);

    const currentJson = (await readExtractedJson(tenant, input.documentId)) as Record<string, unknown>;

    const documentAgent = await getDocumentAgent();

    const fixPrompt = [
      'You are an auto-fixer for a school result-extraction pipeline.',
      'The current JSON failed validation. Apply only mechanical, high-confidence fixes (≥80% confidence).',
      'Do NOT invent marks, names, subjects, or IDs. If a fix would require guessing, leave the error in unresolvedErrors.',
      'After fixes, the resulting fixedJson must be the full corrected JSON (not a partial patch).',
      '',
      'CURRENT MARKDOWN:',
      '```markdown',
      input.currentMarkdown,
      '```',
      '',
      'CURRENT JSON:',
      '```json',
      JSON.stringify(currentJson, null, 2),
      '```',
      '',
      'VALIDATION ERRORS TO FIX:',
      '```json',
      JSON.stringify(input.errors, null, 2),
      '```',
      '',
      'Respond with: reasoning, appliedFixes (path/before/after/explanation), ' +
        'unresolvedErrors (path/message/whyCannotFix), and the full fixedJson.',
    ].join('\n');

    const response = await documentAgent.generate(fixPrompt, {
      ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
      ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
      structuredOutput: { schema: fixOutputSchema },
    });

    const fixObject = (response as { object?: unknown }).object;
    if (!fixObject) {
      throw new Error('STRUCTURED_OUTPUT_EMPTY: document agent returned no object for the fix request');
    }

    const parsedFix = fixOutputSchema.safeParse(fixObject);
    if (!parsedFix.success) {
      throw new Error(`STRUCTURED_OUTPUT_INVALID: ${parsedFix.error.message}`);
    }
    const fix = parsedFix.data;

    await writeExtractedJson(tenant, input.documentId, fix.fixedJson);

    if (fix.appliedFixes.length === 0) {
      return {
        appliedFixes: [],
        unresolvedErrors: fix.unresolvedErrors,
        reStreamedArtifactId: null,
      };
    }

    const artifactId = `artifact-${input.documentId}`;
    const title =
      studentFullName(fix.fixedJson as Record<string, unknown>) ?? 'Document';

    if (writer) {
      await writer.write({
        type: 'data-createDocument',
        id: artifactId,
        data: { status: 'processing', content: '', title, id: artifactId },
      } as never);
    }

    const reRenderPrompt = [
      `Format the corrected structured academic result for ${title} into clean, well-structured markdown.`,
      'Preserve every factual value, subject name, score, and grade from the JSON below.',
      '',
      '```json',
      JSON.stringify(fix.fixedJson, null, 2),
      '```',
    ].join('\n');

    const reStream = await streamWithAutoRetry({
      stream: () =>
        documentAgent.stream(reRenderPrompt, {
          ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
          ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
        }),
      abortSignal: context.abortSignal,
      writer: writer ?? { write: async () => {} },
    });

    let markdown = '';
    for await (const chunk of reStream.textStream) {
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

    return {
      appliedFixes: fix.appliedFixes,
      unresolvedErrors: fix.unresolvedErrors,
      reStreamedArtifactId: artifactId,
    };
  },
});

// ─── Tool 5: commit-marksheet ───────────────────────────────────────────────

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
    const validated: Marksheet = marksheetSchema.parse(raw);

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

// ─── Aggregate Export ───────────────────────────────────────────────────────

export const marksheetTools = {
  getActiveMarksheetTool,
  formatMarksheetDocumentTool,
  validateMarksheetTool,
  autoFixMarksheetTool,
  commitMarksheetTool,
};

export type MarksheetTool = (typeof marksheetTools)[keyof typeof marksheetTools];

// Re-export writeBlob so other chat-workflow subagents (M-RPT, M-CDT) can
// share the same import path without round-tripping through storage/ocr.
export { writeBlob };
