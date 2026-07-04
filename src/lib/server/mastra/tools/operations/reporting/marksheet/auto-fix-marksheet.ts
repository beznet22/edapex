import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { streamWithAutoRetry, type StreamWriterLike } from '../../../../agent-stream-retry';
import { tenantWorkspace } from '../../../../storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetJsonPath, marksheetMarkdownPath } from '../../../../storage/workspaces/paths';
import { addEntry } from '../../../../storage/workspaces/manifest-store';
import type { TenantContext } from '../../../../tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

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

function studentFullName(json: Record<string, unknown>): string | undefined {
  const student = json.student as { fullName?: unknown } | undefined;
  if (student && typeof student.fullName === 'string') {
    return student.fullName;
  }
  return undefined;
}

function studentIdFromJson(json: Record<string, unknown>): number | undefined {
  const student = json.student as { id?: unknown } | undefined;
  if (student && typeof student.id === 'number') {
    return student.id;
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
    'Apply mechanical fixes to the JSON at ≥80% confidence. Writes the fixed JSON to ' +
    'marksheets/<studentId>.json and re-renders the markdown via the document agent.',
  inputSchema: z.object({
    studentId: z.number().int().positive().describe('The studentId whose marksheet JSON should be auto-fixed.'),
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

    const fs = await resolveTenantFilesystem(tenant);
    const jsonPath = marksheetJsonPath(input.studentId);
    if (!(await fs.exists(jsonPath))) {
      throw new Error(`MARKSHEET_JSON_NOT_FOUND: no JSON at ${jsonPath} for studentId=${input.studentId}`);
    }
    const rawJson = await fs.readFile(jsonPath, { encoding: 'utf-8' });
    const currentJson = JSON.parse(typeof rawJson === 'string' ? rawJson : rawJson.toString('utf-8'));

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

    await fs.writeFile(jsonPath, JSON.stringify(fix.fixedJson, null, 2), { recursive: true });
    await addEntry(tenant, {
      path: jsonPath,
      kind: 'marksheet-json',
      studentId: input.studentId,
      uploadedAt: new Date().toISOString(),
      modifiedAt: new Date().toISOString(),
      mimeType: 'application/json'
    });

    if (fix.appliedFixes.length === 0) {
      return {
        appliedFixes: [],
        unresolvedErrors: fix.unresolvedErrors,
        reStreamedArtifactId: null,
      };
    }

    const artifactId = `artifact-student-${input.studentId}`;
    const studentName = studentFullName(fix.fixedJson);
    const title = studentName ?? 'Document';

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
    }

    const sid = studentIdFromJson(fix.fixedJson);
    if (sid !== undefined) {
      const mdPath = marksheetMarkdownPath(sid, studentName ?? null);
      await fs.writeFile(mdPath, markdown, { recursive: true });
      await addEntry(tenant, {
        path: mdPath,
        kind: 'marksheet-markdown',
        studentId: sid,
        uploadedAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        mimeType: 'text/markdown'
      });
    }

    return {
      appliedFixes: fix.appliedFixes,
      unresolvedErrors: fix.unresolvedErrors,
      reStreamedArtifactId: artifactId,
    };
  },
});
