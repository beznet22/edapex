import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetSchema } from '$lib/schema/marksheet';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
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

const marksheetErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string(),
});

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
