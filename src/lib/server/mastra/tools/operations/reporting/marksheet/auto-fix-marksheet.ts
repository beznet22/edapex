import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { streamWithAutoRetry, type StreamWriterLike } from '../../../../agent-stream-retry';
import { tenantWorkspace } from '../../../../storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
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

function studentFullName(json: Record<string, unknown>): string | undefined {
  const student = json.student as { fullName?: unknown } | undefined;
  if (student && typeof student.fullName === 'string') {
    return student.fullName;
  }
  return undefined;
}

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
