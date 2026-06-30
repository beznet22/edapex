import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { type StreamWriterLike } from '$lib/server/mastra/agent-stream-retry';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { marksheetSchema } from '$lib/schema/marksheet';
import { marksheetJsonPath } from '$lib/server/mastra/storage/workspaces/paths';
import { addEntry } from '$lib/server/mastra/storage/workspaces/manifest-store';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';

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

const marksheetErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
  code: z.string(),
});

export const validateMarksheetTool = createTool({
  id: 'validate-marksheet',
  description:
    'Re-derive the JSON from the corrected markdown via the document agent, ' +
    'then run marksheetSchema.safeParseAsync. Persists the validated JSON to marksheets/<studentId>.json.',
  inputSchema: z.object({
    studentId: z
      .number()
      .int()
      .positive()
      .describe('The studentId whose marksheet JSON should be re-derived and validated.'),
    correctedMarkdown: z.string().describe('The user-corrected markdown to re-derive JSON from.'),
  }),
  outputSchema: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), json: z.unknown() }),
    z.object({
      ok: z.literal(false),
      errors: z.array(marksheetErrorSchema),
      unresolvedErrors: z.array(marksheetErrorSchema),
    }),
  ]),
  execute: async (input, ctx) => {
    const context = ctx as MarksheetToolContext;
    const tenant = getTenant(context);

    const documentAgent = await getDocumentAgent();

    const tenantContextBlock = [
      'TENANT CONTEXT (use these to fill fields not present in the markdown):',
      `schoolId: ${tenant.schoolId}`,
      `classId: ${tenant.classId}`,
      `sectionId: ${tenant.sectionId}`,
      `academicId: ${tenant.academicId}`,
      `examTypeId: ${tenant.examTypeId ?? 'unknown'}`,
      `studentId: ${input.studentId}`,
      '',
      'If a field is missing in the markdown, use a sensible default of the correct type:',
      '- strings: empty string ""',
      '- numbers: 0',
      '- arrays: []',
      '- nullable fields: null',
      '- category enum: derive from classId (DAYCARE|NURSERY|GRADEK|LOWERBASIC|MIDDLEBASIC)',
      '',
    ].join('\n');

    const basePrompt = [
      'Re-derive the structured academic result JSON from the following markdown.',
      'Emit ONLY the JSON object that conforms to the Marksheet schema (school, student, subjects, records, score, ratings, remark, examType).',
      '',
      tenantContextBlock,
      'CRITICAL — every field must be present and correctly typed:',
      '- school: object with id (number), name (string), email (string), phone (string), city (string), state (string), title (string), vacation_date (string). NOT a string.',
      '- student: object with id (number), examId (number), fullName (string), gender (string), parentEmail (string), parentName (string), term (string), title (string), category (one of DAYCARE|NURSERY|GRADEK|LOWERBASIC|MIDDLEBASIC), className (string), sectionName (string), adminNo (number), sessionYear (string), daysOpened (number), daysAbsent (number), daysPresent (number), token (string).',
      '- subjects: array of objects {subjectId (number), subjectCode (string), teacherId (number), title (string), type (string)}. NOT strings.',
      '- records: array of objects {studentId (number), resultId (number), subjectId (number), subject (string), subjectCode (string), titleIds (number[]), titles (string[]), markIds (number[]), marks (number[]), fullMarks (number[]), totalScore (number <= 100), grade (string), category (one of DAYCARE|NURSERY|GRADEK|LOWERBASIC|MIDDLEBASIC), learningOutcome (string|null), objectives (string[]|null)}.',
      '- score: object {total (number), average (number), position (number), outOf (number), maxScores (number), classAverage (object|undefined)}.',
      '- ratings: array of objects {attribute (string|null), rate (number), color (string|null), remark (string|null)}.',
      '- remark: object {remark (string|null)}.',
      '- examType: object {id (number), title (string)}.',
      '',
      '```markdown',
      input.correctedMarkdown,
      '```',
    ].join('\n');

    interface AttemptResult {
      json: unknown;
      validationErrors: Array<{ path: string; message: string; code: string }>;
      attempt: number;
    }

    const attempts: AttemptResult[] = [];
    let finalJson: unknown = null;
    let finalValidationIssues: Array<{ path: string; message: string; code: string }> = [];

    for (let attempt = 0; attempt < 3; attempt++) {
      const feedback = attempts
        .map(
          (a) =>
            `Attempt ${a.attempt + 1} failed with these validation errors:\n` +
            a.validationErrors.map((e) => `  - ${e.path || 'root'}: ${e.message}`).join('\n') +
            '\nFix these specific issues and try again.'
        )
        .join('\n\n');

      const prompt = feedback ? `${basePrompt}\n\n${feedback}` : basePrompt;

      try {
        const response = await documentAgent.generate(prompt, {
          ...(context.abortSignal ? { abortSignal: context.abortSignal } : {}),
          ...(context.requestContext ? { requestContext: context.requestContext as never } : {}),
        });
        finalJson =
          (response as { object?: unknown }).object ??
          (() => {
            const text = (response as { text?: string }).text ?? '';
            try {
              return JSON.parse(text);
            } catch {
              return null;
            }
          })();
        if (finalJson === null || finalJson === undefined) {
          attempts.push({
            json: null,
            validationErrors: [{ path: '$', message: 'STRUCTURED_OUTPUT_EMPTY', code: 'empty_output' }],
            attempt,
          });
          continue;
        }
        const parsed = await marksheetSchema.safeParseAsync(finalJson);
        if (parsed.success) {
          // Persist JSON to canonical path: marksheets/<studentId>.json
          const fs = await resolveTenantFilesystem(tenant);
          const jsonPath = marksheetJsonPath(input.studentId);
          await fs.writeFile(jsonPath, JSON.stringify(finalJson, null, 2), { recursive: true });
          await addEntry(tenant, {
            path: jsonPath,
            kind: 'marksheet-json',
            studentId: input.studentId,
            uploadedAt: new Date().toISOString(),
            modifiedAt: new Date().toISOString(),
            mimeType: 'application/json',
          });
          return { ok: true as const, json: finalJson };
        }
        finalValidationIssues = parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
          code: issue.code,
        }));
        attempts.push({ json: finalJson, validationErrors: finalValidationIssues, attempt });
      } catch (err) {
        // Mastra structuredOutput throws MastraError with text like
        // "Structured output validation failed: - school: expected object ..."
        // when the LLM emits structurally invalid JSON. Extract the issues.
        const message = err instanceof Error ? err.message : String(err);
        const retryAfterSec = parseRetryAfter(err);
        if (retryAfterSec > 0 && attempt < 2) {
          await sleep(retryAfterSec * 1000);
          attempts.push({ json: null, validationErrors: [{ path: '$', message: 'RATE_LIMITED', code: 'rate_limited' }], attempt });
          continue;
        }
        const issues = parseStructuredOutputError(message);
        attempts.push({ json: null, validationErrors: issues, attempt });
      }
    }

    // All 3 attempts exhausted. Return the last best-effort JSON so the
    // caller (workflow auto-fix loop) can attempt further repair.
    return {
      ok: false as const,
      errors: [],
      unresolvedErrors:
        finalValidationIssues.length > 0
          ? finalValidationIssues
          : attempts[attempts.length - 1]?.validationErrors ?? [
              {
                path: '$',
                message: 'STRUCTURED_OUTPUT_FAILED: document agent could not produce a marksheetSchema-conformant JSON after 3 attempts',
                code: 'exhausted_retries',
              },
            ],
    };
  }
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(err: unknown): number {
  if (!err || typeof err !== 'object') return 0;
  const e = err as { message?: string; statusCode?: number; responseHeaders?: Record<string, string>; data?: unknown };
  const msg = typeof e.message === 'string' ? e.message : '';
  const match = msg.match(/try again in ([0-9.]+)s/i);
  if (match && match[1]) return Math.ceil(parseFloat(match[1]));
  if (e.responseHeaders && typeof e.responseHeaders === 'object') {
    const ra = e.responseHeaders['retry-after'] ?? e.responseHeaders['x-ratelimit-reset'];
    if (ra) {
      const secs = parseInt(ra, 10);
      if (!Number.isNaN(secs)) return secs;
    }
  }
  if (e.statusCode === 429) return 10;
  return 0;
}

function parseStructuredOutputError(message: string): Array<{ path: string; message: string; code: string }> {
  // Matches lines like "- student.id: Invalid input: expected number, received undefined"
  const lines = message.split('\n').filter((l) => l.trim().startsWith('- '));
  if (lines.length === 0) {
    return [{ path: '$', message, code: 'structured_output_failed' }];
  }
  return lines.map((line) => {
    const trimmed = line.replace(/^- /, '').trim();
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) {
      return { path: '$', message: trimmed, code: 'structured_output_failed' };
    }
    const path = trimmed.slice(0, colonIdx).trim();
    const msg = trimmed.slice(colonIdx + 1).trim();
    return { path: path || '$', message: msg, code: 'structured_output_failed' };
  });
}
