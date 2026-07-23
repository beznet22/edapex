/**
 * File API Route — EdApex Workspace
 *
 * Serves the per-tenant workspace filesystem through the Mastra `Workspace`
 * abstraction. Tenant isolation is enforced by `LocalFilesystem({ contained: true })`
 * which blocks path traversal at the framework level — no regex sanitization
 * is needed here.
 *
 * The workspace is resolved per request via `resolveTenantWorkspace` (the
 * central workspace resolver in scope.ts) which guarantees the correct
 * human-readable path is used and eliminates stale ID-only ghost directories.
 *
 * Batch OCR actions (`?action=batch-extract|status|finalize`) are routed to
 * `OcrBatchService` and are designed to be called from the dedicated task
 * worker (see `$lib/workers/task-worker.ts`). The worker polls status and
 * finalizes without blocking the main thread.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { auth } from '$lib/server/service/auth.service';
import { tenantWorkspace, sharedDir } from '$lib/server/workspace';
import { assertPathAgentVisible, resolveTenantWorkspace, WorkspaceScopeError } from '$lib/server/workspace/scope';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { ocrBatchService } from '$lib/server/service/ocr-batch.service';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { addEntry as addWorkspaceEntry, readAllManifests, readManifest, updateEntry, writeManifest, type FileStatus } from '$lib/server/workspace/manifest';

import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { marksheetSchema } from '$lib/schema/marksheet';
import { extractTableField } from '$lib/utils/marksheet-ast-parser';
import { buildMarksheetParseContext } from '$lib/server/mastra/tools/operations/reporting/marksheet/parse-context';
import { createAssessmentServiceForRequest } from '$lib/server/service/assessment.service';
import { DIAGNOSTIC_MODEL } from '$lib/server/mastra/agents/diagnostic';
import { resolveModelForRequest } from '$lib/server/mastra/provider';
import { crossReferenceSubjects } from '$lib/server/mastra/tools/operations/reporting/marksheet/validate-cross-ref';
import type { SerializedTenant } from '$lib/types/background-tasks';
import type { FileEntry } from '@mastra/core/workspace';
import { resolveUserRole } from '$lib/server/mastra/provider/role-resolver';

function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'md': return 'text/markdown';
    case 'txt': return 'text/plain';
    case 'json': return 'application/json';
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'html': return 'text/html';
    case 'css': return 'text/css';
    case 'js': return 'application/javascript';
    default: return 'application/octet-stream';
  }
}

function safeRelPath(rawPath: string | undefined): string {
  return (rawPath ?? '').replace(/^\/+/, '');
}

function resolveScopedPath(
  tenant: ReturnType<typeof import('$lib/server/mastra/tenant-context')['createTenantContext']>,
  paramsPath: string | undefined,
): string {
  const relPath = safeRelPath(paramsPath);
  if (relPath === '') return '.';
  try {
    return assertPathAgentVisible(tenant, paramsPath ?? '');
  } catch (err) {
    if (!(err instanceof WorkspaceScopeError)) throw err;
    throw new WorkspaceScopeError(`WORKSPACE_SCOPE_VIOLATION: ${err.message}`);
  }
}

/**
 * Designation IDs allowed to write to or delete from `<yearRoot>/shared/`.
 * Sourced from `$lib/types/sms-types.ts` (1 = IT, 4 = Admin, 5 = Coordinator,
 * 9 = IT Support). Read access is open to any authenticated user; writes are
 * restricted to the same gate that gates bulk photo imports.
 */
const ALLOWED_SHARED_DESIGNATIONS: ReadonlySet<number> = new Set([
  ALLOWED_DESIGNATIONS.IT,
  4, // Admin
  ALLOWED_DESIGNATIONS.COORDINATOR,
  9, // IT Support
]);

function assertSharedWriteAuthorized(
  tenant: ReturnType<typeof import('$lib/server/mastra/tenant-context')['createTenantContext']>,
): void {
  if (!ALLOWED_SHARED_DESIGNATIONS.has(tenant.designationId)) {
    throw error(403, 'Only IT, Admin, Coordinator, or IT Support can modify shared files');
  }
}

/**
 * Resolve a `shared/...` path to its absolute disk location under the
 * academic year root, verifying the path stays within `<yearRoot>/shared/`.
 * Returns `{ root, absolute, rel }` so callers can write to disk via raw
 * `fs.promises` and still report a URL-safe relative path back to the client.
 */
function resolveSharedPath(
  tenant: ReturnType<typeof import('$lib/server/mastra/tenant-context')['createTenantContext']>,
  paramsPath: string | undefined,
): { root: string; absolute: string; rel: string } {
  const rel = safeRelPath(paramsPath);
  if (!rel.startsWith('shared/')) {
    throw new Error('resolveSharedPath called with non-shared path');
  }
  const within = rel.slice('shared/'.length);
  const root = sharedDir(tenant);
  const absolute = path.resolve(root, within);
  if (!absolute.startsWith(root + path.sep) && absolute !== root) {
    throw error(403, 'Path traversal blocked');
  }
  return { root, absolute, rel };
}

function entryToWire(entry: FileEntry): {
  name: string;
  type: 'file' | 'directory';
  key: string;
  size?: number;
} {
  return {
    name: entry.name,
    type: entry.type,
    key: entry.name,
    size: entry.size,
  };
}

export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { tenant, requestContext, fs } = await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get('selected-class'),
    });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    const resolvedPath = resolveScopedPath(tenant, params.path);
    const action = url.searchParams.get('action');

    if (safeRelPath(params.path).startsWith('shared/')) {
      const { absolute } = resolveSharedPath(tenant, params.path);
      const fsModule = await import('node:fs/promises');
      const content = await fsModule.readFile(absolute);
      const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      return new Response(buffer, {
        headers: {
          'Content-Type': contentTypeFor(absolute),
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=3600, immutable',
        },
      });
    }

    if (action === 'list') {
      const entries = await fs.readdir(resolvedPath, { recursive: true });
      const items = entries
        .filter((e) => e.name !== '.' && e.name !== '..')
        .map(entryToWire);
      return json({ success: true, result: { items } });
    }

    if (action === 'batch-status') {
      const jobId = url.searchParams.get('jobId');
      if (!jobId) throw new Error("Missing 'jobId' for batch-status");
      const result = await ocrBatchService.pollBatch(jobId, emptySerializedTenant(tenant), getAppDb());
      return json({ success: true, ...result });
    }

    if (action === 'download') {
      const content = await fs.readFile(resolvedPath);
      const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      return new Response(buffer, {
        headers: {
          'Content-Type': contentTypeFor(resolvedPath),
          'Content-Length': buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${resolvedPath.split('/').pop() ?? 'download'}"`,
        },
      });
    }

    const content = await fs.readFile(resolvedPath);
    const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    return new Response(buffer, {
      headers: {
        'Content-Type': contentTypeFor(resolvedPath),
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    if (e instanceof WorkspaceScopeError) {
      return json({ success: false, error: 'WORKSPACE_SCOPE_VIOLATION', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

export const POST: RequestHandler = async ({ params, url, request, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const examTypeIdParam = url.searchParams.get('examTypeId');
    const parsedExamTypeId = examTypeIdParam ? parseInt(examTypeIdParam, 10) : null;

    const { tenant, requestContext, fs } = await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get('selected-class'),
      examTypeId: parsedExamTypeId,
    });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    const resolvedPath = resolveScopedPath(tenant, params.path);
    const action = url.searchParams.get('action');

    if (action === 'rename') {
      const toParam = url.searchParams.get('to');
      if (!toParam) throw new Error("Missing 'to' parameter for rename");
      const toResolved = resolveScopedPath(tenant, toParam);
      await fs.moveFile(resolvedPath, toResolved, { overwrite: true });
      return json({ success: true, path: toResolved });
    }

    if (action === 'batch-extract') {
      const body = (await request.json()) as { keys?: string[]; tenant?: SerializedTenant };
      const keys = body.keys ?? [];
      if (keys.length === 0) throw new Error('No keys supplied for batch-extract');
      const result = await ocrBatchService.startBatch(body.tenant ?? emptySerializedTenant(tenant), keys, getAppDb());
      return json({ success: true, ...result });
    }

    if (action === 'batch-finalize') {
      const body = (await request.json()) as { jobId?: string; keys?: string[]; tenant?: SerializedTenant };
      if (!body.jobId) throw new Error("Missing 'jobId' for batch-finalize");
      const keys = body.keys ?? [];
      if (keys.length === 0) throw new Error('No keys supplied for batch-finalize');
      const result = await ocrBatchService.finalizeBatch(body.tenant ?? emptySerializedTenant(tenant), body.jobId, keys, getAppDb());
      return json({ success: true, ...result });
    }

    /**
     * Single-file direct OCR. Used by:
     *   - The 1-image auto-OCR path (background task via the worker)
     *   - The 2-3 image auto-OCR path (inline call from queueUpload)
     *   - The Extract button for 1-3 selected files (inline call)
     *
     * Unlike `batch-extract` this is a single direct Mistral call — no
     * batch job, no polling. The worker uses an `AbortController` so
     * the in-flight call can be cancelled mid-flight via the `cancel`
     * worker message. The Mistral client uses the env `MISTRAL_API_KEY`
     * (consistent with the existing `mistralOcrService` path).
     */
    if (action === 'ocr-direct') {
      const body = (await request.json()) as { key?: string; tenant?: SerializedTenant };
      if (!body.key) throw new Error("Missing 'key' for ocr-direct");
      const tContext = ocrBatchService['rehydrateTenant'](
        body.tenant ?? emptySerializedTenant(tenant)
      );
      const requestContext = buildWorkspaceRequestContext(tContext);
      const fs = await tenantWorkspace.resolveFilesystem({
        requestContext: requestContext as never
      });
      if (!fs) throw error(500, 'Workspace filesystem unavailable');
      const resolvedPath = resolveScopedPath(tContext, body.key);
      const raw = await fs.readFile(resolvedPath);
      const bytes = raw instanceof Uint8Array
        ? raw
        : new TextEncoder().encode(String(raw));
      const filename = resolvedPath.split('/').pop() ?? 'ocr';
      const ocrResponse = await mistralOcrService.processDocument(bytes, filename, {
        db: getAppDb(),
        userId: tContext.userId,
        schoolId: tContext.schoolId,
        userRole: resolveUserRole(tContext.designationId)
      });
      const pages = (ocrResponse as { pages?: Array<{ markdown?: string }> }).pages ?? [];
      const markdown = pages.map((p) => p.markdown ?? '').filter(Boolean).join('\n\n');
      const mistralFileId = (ocrResponse as { fileId?: string }).fileId ?? '';
      // Pass the precomputed Mistral result to getOrCreate so it doesn't
      // make a second Mistral call. db + userId are required by the
      // signature even when precomputed is provided.
      const persisted = await OcrWorkspaceStore.getOrCreate({
        tenant: tContext,
        file: bytes,
        fileName: filename,
        mimeType: 'text/markdown',
        db: getAppDb(),
        userId: tContext.userId,
        precomputed: {
          markdown,
          mistralFileId,
          pagesProcessed: ocrResponse.usageInfo?.pagesProcessed
        }
      });
      if (body.key && tContext.examTypeId != null) {
        await updateEntry(tContext, body.key, { status: 'Extracted' }, tContext.examTypeId);
      }
      return json({
        success: true,
        contentHash: persisted.contentHash,
        mistralFileId: persisted.mistralFileId,
        manifestStatus: 'Extracted',
      });
    }

    /**
     * Request cancellation of a running Mistral batch job. Used by the
     * worker when the user clicks Cancel in the popover or when the
     * local 5-min poll cap hits. Fire-and-forget on Mistral's side; the
     * next `pollBatch` call observes `CANCELLATION_REQUESTED` then
     * `CANCELLED`.
     */
    if (action === 'cancel-batch') {
      const body = (await request.json()) as { jobId?: string; tenant?: SerializedTenant };
      if (!body.jobId) throw new Error("Missing 'jobId' for cancel-batch");
      await ocrBatchService.cancelBatch(
        body.jobId,
        body.tenant ?? emptySerializedTenant(tenant),
        getAppDb()
      );
      return json({ success: true });
    }

    if (action === 'auto-fix') {
      if (!params.path) throw error(400, 'Path parameter required for auto-fix');
      if (!tenant.examTypeId) throw error(400, 'EXAM_TYPE_REQUIRED for auto-fix');
      const raw = await fs.readFile(resolvedPath);
      const markdown = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      const { parseMarksheetMarkdown, generateMarksheetMarkdown, parseMentions } = await import('$lib/utils/marksheet-ast-parser');
      const parseContext = await buildMarksheetParseContext(markdown, tenant);
      const parsed = parseMarksheetMarkdown(markdown, parseContext);
      const mentions = parseMentions(markdown);
      const enteredAdmNo = extractTableField(markdown, 'admission no');
      const result = await marksheetSchema.safeParseAsync(parsed);

      const hasAdmNoMismatch = enteredAdmNo != null && Number(enteredAdmNo) !== parsed.student.adminNo;
      const originalErrors: string[] = [];
      if (hasAdmNoMismatch) {
        originalErrors.push(`Admission No mismatch: file has ${enteredAdmNo}, roster records ${parsed.student.adminNo}`);
      }

      let zodErrors: string[] = [];
      let writeFailed = false;
      let validationWarnings: string[] = [];
      let crossRefErrors: Array<{ subjectId: number; subjectCode: string | null; message: string }> | undefined;
      if (tenant.classId != null && tenant.sectionId != null) {
        try {
          const assessment = await createAssessmentServiceForRequest(tenant);
          const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
          let omitSet: Set<number> | undefined;
          try {
            const m = await readManifest(tenant, tenant.examTypeId);
            const e = m.entries[params.path!];
            if (e?.omittedSubjectIds?.length) omitSet = new Set(e.omittedSubjectIds);
          } catch { /* best-effort */ }
          const warnings = crossReferenceSubjects(parsed, assigned, omitSet);
          if (warnings.length > 0) {
            crossRefErrors = warnings;
            validationWarnings = warnings.map(w => w.message);
          }
        } catch { /* best-effort */ }
      }
      if (result.success) {
        const canonicalMd = generateMarksheetMarkdown(parsed);
        const reParsed = parseMarksheetMarkdown(canonicalMd, parseContext);
        const reResult = await marksheetSchema.safeParseAsync(reParsed);
        const reValid = reResult.success && reParsed.student.adminNo === parsed.student.adminNo && reParsed.records.length === parsed.records.length && canonicalMd.length > 0;
        if (reValid) {
          const fixedBytes = new TextEncoder().encode(canonicalMd);
          await fs.writeFile(resolvedPath, fixedBytes, { overwrite: true });
          await updateEntry(tenant, params.path!, {
            validationErrors: [],
            validationErrorCount: 0,
            validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
            validationWarningCount: validationWarnings.length > 0 ? validationWarnings.length : undefined,
            crossRefErrors,
            status: 'Validated',
          }, tenant.examTypeId);
          return json({
            fixed: hasAdmNoMismatch,
            errors: [],
            markdown: canonicalMd,
            ...(originalErrors.length > 0 ? { originalErrors } : {}),
            ...(validationWarnings.length > 0 ? { warnings: validationWarnings } : {}),
          });
        }
        zodErrors = !reResult.success
          ? reResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
          : [];
        if (canonicalMd.length === 0) zodErrors.push('Generated marksheet markdown is empty — no changes written');
        if (reParsed.student.adminNo !== parsed.student.adminNo) zodErrors.push(`Regeneration altered student identity: adminNo changed from ${parsed.student.adminNo} to ${reParsed.student.adminNo}`);
        if (reParsed.records.length !== parsed.records.length) zodErrors.push(`Regeneration altered record count: ${parsed.records.length} → ${reParsed.records.length}`);
        writeFailed = true;
      } else {
        zodErrors = result.error?.issues.map(i => `${i.path.join('.')}: ${i.message}`) ?? [];
        if (hasAdmNoMismatch) {
          zodErrors.push(`Admission No mismatch: file has ${enteredAdmNo}, roster records ${parsed.student.adminNo}`);
        }
      }

      let llmAdvice = '';
      try {
        const db = getAppDb();
        const traceContext = {
          userId: locals.user.id,
          schoolId: tenant.schoolId,
          actorStaffId: tenant.staffId,
          userRole: resolveUserRole(tenant.designationId),
          todayTokenUsage: 0,
        };
        const resolved = await resolveModelForRequest(locals.user.id, DIAGNOSTIC_MODEL, db, undefined, traceContext);
        const { mastra } = await import('$lib/server/mastra');
        const agent = mastra.getAgent('diagnostic');
        const contextErrors = [...zodErrors, ...originalErrors].filter(Boolean);
        const userPrompt = `Current marksheet markdown:\n\n${markdown}\n\nValidation errors:\n${contextErrors.join('\n')}`;
        const result = await agent.generate(userPrompt, {
          model: resolved.config as never,
        });
        llmAdvice = result.text;
      } catch {
        llmAdvice = '';
      }

      const allErrors = [...zodErrors, ...(writeFailed ? originalErrors : [])];
      await updateEntry(tenant, params.path!, {
        validationErrors: allErrors,
        validationErrorCount: allErrors.length,
        validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
        validationWarningCount: validationWarnings.length > 0 ? validationWarnings.length : undefined,
        crossRefErrors,
        status: 'Failed',
      }, tenant.examTypeId);
      return json({ fixed: false, errors: allErrors, originalErrors: allErrors, diagnostics: llmAdvice, warnings: validationWarnings, status: 'Failed' });
    }

    if (action === 'omit-subject') {
      if (!params.path) throw error(400, 'Path parameter required for omit-subject');
      if (!tenant.examTypeId) throw error(400, 'EXAM_TYPE_REQUIRED for omit-subject');
      const body = (await request.json()) as { subjectId: number; omit: boolean };
      if (typeof body.subjectId !== 'number' || typeof body.omit !== 'boolean') {
        throw error(400, 'Body must contain subjectId (number) and omit (boolean)');
      }

      // Read manifest, update omittedSubjectIds
      const m = await readManifest(tenant, tenant.examTypeId);
      const entry = m.entries[params.path];
      const current = entry?.omittedSubjectIds ?? [];
      const omitted = new Set(current);
      if (body.omit) omitted.add(body.subjectId);
      else omitted.delete(body.subjectId);
      const newOmitted = [...omitted];

      await updateEntry(tenant, params.path!, {
        omittedSubjectIds: newOmitted,
      }, tenant.examTypeId);

      // Re-validate (same logic as action=validate)
      const raw = await fs.readFile(resolvedPath);
      const markdown = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);
      let validationErrors: string[] = [];
      let validationWarnings: string[] = [];
      let crossRefErrors: Array<{ subjectId: number; subjectCode: string | null; message: string }> | undefined;
      if (params.path.includes('marksheets/') && params.path.endsWith('.md')) {
        try {
          const { parseMarksheetMarkdown, parseMentions } = await import('$lib/utils/marksheet-ast-parser');
          const parseContext = await buildMarksheetParseContext(markdown, tenant);
          const parsed = parseMarksheetMarkdown(markdown, parseContext);
          const enteredAdmNo = extractTableField(markdown, 'admission no');
          const mentions = parseMentions(markdown);
          if (enteredAdmNo && Number(enteredAdmNo) !== parsed.student.adminNo) {
            validationErrors.push(
              `Admission No mismatch: file has ${enteredAdmNo}, but roster records ${parsed.student.adminNo}. The roster value will be used on reload.`
            );
          }
          const result = await marksheetSchema.safeParseAsync(parsed);
          if (!result.success) {
            validationErrors.push(...result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
          }
          if (tenant.classId != null && tenant.sectionId != null && result.success) {
            try {
              const assessment = await createAssessmentServiceForRequest(tenant);
              const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
              const missing = crossReferenceSubjects(result.data, assigned, omitted);
              if (missing.length > 0) {
                crossRefErrors = missing;
                validationErrors.push(...missing.map(w => w.message));
              }
            } catch { /* best-effort */ }
          }

          const validateStatus = validationErrors.length > 0 ? 'Failed' : 'Validated';
          await updateEntry(tenant, params.path!, {
            validationErrors,
            validationErrorCount: validationErrors.length,
            validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
            validationWarningCount: validationWarnings.length > 0 ? validationWarnings.length : undefined,
            crossRefErrors,
            omittedSubjectIds: newOmitted,
            status: validateStatus,
          }, tenant.examTypeId);

          return json({
            success: true,
            validation: { errors: validationErrors, errorCount: validationErrors.length, warnings: validationWarnings, warningCount: validationWarnings.length, crossRefErrors },
            manifestStatus: validateStatus,
            omittedSubjectIds: newOmitted,
          });
        } catch (parseErr) {
          return json({
            success: false,
            validation: { errors: [`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`], errorCount: 1, warnings: [], warningCount: 0 },
            manifestStatus: 'Failed',
            omittedSubjectIds: newOmitted,
          });
        }
      }
      return json({
        success: true,
        validation: { errors: [], errorCount: 0, warnings: [], warningCount: 0 },
        manifestStatus: 'Validated',
        omittedSubjectIds: newOmitted,
      });
    }

    if (action === 'validate') {
      if (!params.path) throw error(400, 'Path parameter required for validate');
      if (!tenant.examTypeId) throw error(400, 'EXAM_TYPE_REQUIRED for validate');
      const raw = await fs.readFile(resolvedPath);
      const markdown = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);

      let validationErrors: string[] = [];
      let validationWarnings: string[] = [];
      let crossRefErrors: Array<{ subjectId: number; subjectCode: string | null; message: string }> | undefined;
      if (params.path.includes('marksheets/') && params.path.endsWith('.md')) {
        try {
          const { parseMarksheetMarkdown, parseMentions } = await import('$lib/utils/marksheet-ast-parser');
          const parseContext = await buildMarksheetParseContext(markdown, tenant);
          const parsed = parseMarksheetMarkdown(markdown, parseContext);

          const enteredAdmNo = extractTableField(markdown, 'admission no');
          const mentions = parseMentions(markdown);
          if (enteredAdmNo && Number(enteredAdmNo) !== parsed.student.adminNo) {
            validationErrors.push(
              `Admission No mismatch: file has ${enteredAdmNo}, but roster records ${parsed.student.adminNo}. The roster value will be used on reload.`
            );
          }

          const result = await marksheetSchema.safeParseAsync(parsed);
          if (!result.success) {
            validationErrors.push(...result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
          }
          if (tenant.classId != null && tenant.sectionId != null && result.success) {
            try {
              const assessment = await createAssessmentServiceForRequest(tenant);
              const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
              let omitSet: Set<number> | undefined;
              try {
                const m = await readManifest(tenant, tenant.examTypeId);
                const e = m.entries[params.path!];
                if (e?.omittedSubjectIds?.length) omitSet = new Set(e.omittedSubjectIds);
              } catch { /* best-effort */ }
              const missing = crossReferenceSubjects(result.data, assigned, omitSet);
              if (missing.length > 0) {
                crossRefErrors = missing;
                validationErrors.push(...missing.map(w => w.message));
              }
            } catch { /* best-effort */ }
          }

          const entryUpdate: Record<string, unknown> = {
            validationErrors,
            validationErrorCount: validationErrors.length,
            validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
            validationWarningCount: validationWarnings.length > 0 ? validationWarnings.length : undefined,
            crossRefErrors,
            status: validationErrors.length > 0 ? 'Failed' : 'Validated',
          };
          await updateEntry(
            tenant, params.path,
            entryUpdate as Partial<import('$lib/server/workspace/manifest').ManifestEntry>,
            tenant.examTypeId
          );
        } catch (parseErr) {
          validationErrors = [`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`];
        }
      }

      const validateStatus = validationErrors.length > 0 ? 'Failed' : 'Validated';
      return json({
        success: true,
        validation: { errors: validationErrors, errorCount: validationErrors.length, warnings: validationWarnings, warningCount: validationWarnings.length, crossRefErrors },
        manifestStatus: validateStatus
      });
    }

    const contentType = request.headers.get('content-type') || '';
    let bytes: Uint8Array;
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const fileData = formData.get('file');
      if (!fileData || typeof fileData === 'string') {
        throw new Error('No file found in multipart form data');
      }
      bytes = new Uint8Array(await fileData.arrayBuffer());
    } else {
      const blob = await request.blob();
      bytes = new Uint8Array(await blob.arrayBuffer());
    }

    await fs.writeFile(resolvedPath, bytes, { recursive: true, overwrite: true });

    if (tenant.examTypeId != null) {
      const fileName = resolvedPath.split('/').pop() ?? 'file';
      const contentHash = createHash('sha256').update(bytes).digest('hex');
      await addWorkspaceEntry(
        tenant,
        {
          path: params.path ?? '',
          kind: 'user-file',
          status: 'Uploaded',
          documentId: randomUUID(),
          fileName,
          contentHash,
          examTypeId: tenant.examTypeId,
          uploadedAt: new Date().toISOString(),
          modifiedAt: new Date().toISOString(),
          mimeType: contentTypeFor(resolvedPath),
          sizeBytes: bytes.length,
        },
        tenant.examTypeId
      );
    }

    return json({ success: true, path: resolvedPath });
  } catch (e: unknown) {
    if (e instanceof WorkspaceScopeError) {
      console.error('[file-api] PUT SCOPE_VIOLATION', { path: params.path, message: e.message });
      return json({ success: false, error: 'WORKSPACE_SCOPE_VIOLATION', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    const detail = (e as { data$?: unknown; detail?: unknown }).data$ ?? (e as { detail?: unknown }).detail;
    console.error('[file-api] PUT ERROR', { path: params.path, message, detail, userId: locals.user?.id });
    return json({ success: false, error: message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params, url, locals, cookies }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const { tenant, requestContext, fs } = await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get('selected-class'),
    });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    if (safeRelPath(params.path).startsWith('shared/')) {
      assertSharedWriteAuthorized(tenant);
      const { absolute, rel } = resolveSharedPath(tenant, params.path);
      const fsModule = await import('node:fs/promises');
      await fsModule.unlink(absolute);
      let sidecarDeleted = false;
      if (rel.startsWith('shared/photos/') && !rel.endsWith('.json')) {
        const sidecarPath = absolute.replace(/\.\w+$/, '.json');
        try { await fsModule.unlink(sidecarPath); sidecarDeleted = true; } catch { /* no sidecar */ }
      }
      return json({ success: true, path: rel, sidecarDeleted });
    }

    const resolvedPath = resolveScopedPath(tenant, params.path);
    await fs.deleteFile(resolvedPath);

    // Best-effort manifest cleanup across every exam this tenant owns.
    // Manifest writes are scoped per-exam; we strip the entry from every
    // manifest that references it so the next load() does not surface a
    // ghost artifact (file gone, manifest still claiming it exists).
    //
    // If the deleted path is a generated marksheet (kind = "marksheet-markdown"
    // or a "user-file" that was promoted to Formatted), we additionally
    // revert the linked source upload's status to "Extracted" so the user
    // can re-trigger formatting without re-uploading the image.
    const relPath = params.path ?? '';
    let manifestTouched = 0;
    let sourceReverted = 0;
    try {
      const manifests = await readAllManifests(tenant);
      let documentId: string | undefined;
      for (const m of manifests) {
        if (!m.entries[relPath] && !manifestReferencesPath(m, relPath)) continue;
        const entry = m.entries[relPath];
        if (entry?.documentId) documentId = entry.documentId;
        delete m.entries[relPath];
        m.byKind.ocrUploads = m.byKind.ocrUploads.filter(
          (x) => !relPath.endsWith(`ocr/${x.fileName}.md`),
        );
        m.byKind.marksheets = m.byKind.marksheets.filter(
          (x) => !relPath.endsWith(`marksheets/${x.studentId}.json`),
        );
        m.byKind.transcripts = m.byKind.transcripts.filter(
          (x) => !relPath.endsWith(`transcripts/${x.studentId}.json`),
        );
        m.byKind.pdfs = m.byKind.pdfs.filter((x) => x.name !== relPath);
        m.byKind.notes = m.byKind.notes.filter((x) => x.path !== relPath);
        m.byKind.photos = m.byKind.photos.filter((x) => x.path !== relPath);
        await writeManifest(tenant, m, m.examTypeId);
        manifestTouched += 1;
      }

      // Revert the linked source upload to "Extracted" so the user can
      // re-run format-document without re-uploading the image.
      if (documentId) {
        for (const m of manifests) {
          const source = Object.values(m.entries).find(
            (e) => e.documentId === documentId && e.kind === "user-file",
          );
          if (source) {
            await updateEntry(
              tenant,
              source.path,
              { status: "Extracted" },
              m.examTypeId,
            );
            sourceReverted += 1;
            break;
          }
        }
      }
    } catch (cleanupErr) {
      console.warn('[file-api] DELETE manifest cleanup failed', {
        relPath,
        err: cleanupErr,
      });
    }

    return json({ success: true, path: resolvedPath, manifestTouched, sourceReverted });
  } catch (e: unknown) {
    if (e instanceof WorkspaceScopeError) {
      return json({ success: false, error: 'WORKSPACE_SCOPE_VIOLATION', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

function manifestReferencesPath(
  m: import('$lib/server/workspace/manifest').WorkspaceManifest,
  relPath: string,
): boolean {
  if (m.byKind.ocrUploads.some((x) => relPath.endsWith(`ocr/${x.fileName}.md`))) return true;
  if (m.byKind.marksheets.some((x) => relPath.endsWith(`marksheets/${x.studentId}.json`))) return true;
  if (m.byKind.transcripts.some((x) => relPath.endsWith(`transcripts/${x.studentId}.json`))) return true;
  if (m.byKind.pdfs.some((x) => x.name === relPath)) return true;
  if (m.byKind.notes.some((x) => x.path === relPath)) return true;
  if (m.byKind.photos.some((x) => x.path === relPath)) return true;
  return false;
}

export const PUT: RequestHandler = async ({ params, request, locals, cookies, url }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');
    const examTypeIdParam = url.searchParams.get('examTypeId');
    const parsedExamTypeId = examTypeIdParam ? parseInt(examTypeIdParam, 10) : null;
    const entryKind = url.searchParams.get('kind') ?? 'user-file';

    const { tenant, requestContext, fs } = await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      selectedClassCookie: cookies.get('selected-class'),
      examTypeId: parsedExamTypeId,
    });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    if (safeRelPath(params.path).startsWith('shared/')) {
      assertSharedWriteAuthorized(tenant);
      const { absolute, rel } = resolveSharedPath(tenant, params.path);
      const fsModule = await import('node:fs/promises');
      const form = await request.formData();
      const file = form.get('file');
      if (!(file instanceof File)) throw error(400, 'Missing file field');
      const fileBytes = new Uint8Array(await file.arrayBuffer());
      await fsModule.mkdir(path.dirname(absolute), { recursive: true } as Parameters<typeof fsModule.mkdir>[1]);
      await fsModule.writeFile(absolute, fileBytes, { recursive: true, overwrite: true } as Parameters<typeof fsModule.writeFile>[2]);
      let sidecarWritten = false;
      const metadata = form.get('metadata');
      if (typeof metadata === 'string' && metadata.length > 0 && rel.startsWith('shared/photos/') && !rel.endsWith('.json')) {
        const sidecarPath = absolute.replace(/\.\w+$/, '.json');
        await fsModule.writeFile(sidecarPath, metadata, { recursive: true, overwrite: true } as Parameters<typeof fsModule.writeFile>[2]);
        sidecarWritten = true;
      }
      const contentHash = createHash('sha256').update(fileBytes).digest('hex');
      return json({ success: true, url: `/api/file/${rel}`, contentHash, sidecarWritten });
    }

    const resolvedPath = resolveScopedPath(tenant, params.path);
    const blob = await request.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // console.info('[file-api] PUT', {
    //   userId: locals.user.id,
    //   schoolId: tenant.schoolId,
    //   classId: tenant.classId,
    //   sectionId: tenant.sectionId,
    //   academicId: tenant.academicId,
    //   examTypeId: tenant.examTypeId,
    //   path: resolvedPath,
    //   size: bytes.length,
    //   at: new Date().toISOString(),
    // });

    await fs.writeFile(resolvedPath, bytes, { recursive: true, overwrite: true });

    const fileName = resolvedPath.split('/').pop() ?? 'upload';
    const contentHash = createHash('sha256').update(bytes).digest('hex');
    if (tenant.examTypeId == null) {
      throw error(400, 'EXAM_TYPE_REQUIRED: cannot register a workspace upload without an active examTypeId');
    }
    const manifestRelPath = params.path ?? '';

    await addWorkspaceEntry(
      tenant,
      {
        path: manifestRelPath,
        kind: entryKind as any,
        status: 'Uploaded',
        documentId: randomUUID(),
        fileName,
        contentHash,
        examTypeId: tenant.examTypeId,
        uploadedAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        mimeType: contentTypeFor(resolvedPath),
        sizeBytes: bytes.length,
      },
      tenant.examTypeId
    );

    // ── Marksheet validation ──
    let validationErrors: string[] = [];
    let validationWarnings: string[] = [];
    let status: FileStatus | undefined;
    let crossRefErrors: Array<{ subjectId: number; subjectCode: string | null; message: string }> | undefined;
    if (manifestRelPath.includes('marksheets/') && manifestRelPath.endsWith('.md')) {
      try {
        const { parseMarksheetMarkdown, parseMentions } = await import('$lib/utils/marksheet-ast-parser');
        const content = new TextDecoder().decode(bytes);
        const parseContext = await buildMarksheetParseContext(content, tenant);
        const parsed = parseMarksheetMarkdown(content, parseContext);

        const mentions = parseMentions(content);
        const enteredAdmNo = extractTableField(content, 'admission no');
        if (enteredAdmNo && Number(enteredAdmNo) !== parsed.student.adminNo) {
          validationErrors.push(
            `Admission No mismatch: file has ${enteredAdmNo}, but roster records ${parsed.student.adminNo}. The roster value will be used on reload.`
          );
        }

        const result = await marksheetSchema.safeParseAsync(parsed);
        if (!result.success) {
          validationErrors.push(...result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
        }
        if (tenant.classId != null && tenant.sectionId != null && result.success) {
          try {
            const assessment = await createAssessmentServiceForRequest(tenant);
            const assigned = await assessment.getAssignedSubjects(tenant.classId, tenant.sectionId);
            let omitSet: Set<number> | undefined;
            try {
              const m = await readManifest(tenant, tenant.examTypeId!);
              const e = m.entries[manifestRelPath];
              if (e?.omittedSubjectIds?.length) omitSet = new Set(e.omittedSubjectIds);
            } catch { /* best-effort */ }
            const missing = crossReferenceSubjects(result.data, assigned, omitSet);
            if (missing.length > 0) {
              crossRefErrors = missing;
              validationErrors.push(...missing.map(w => w.message));
            }
          } catch { /* best-effort */ }
        }
        status = validationErrors.length > 0 ? 'Failed' : 'Validated';
        await updateEntry(
          tenant, manifestRelPath,
          {
            validationErrors,
            validationErrorCount: validationErrors.length,
            validationWarnings: validationWarnings.length > 0 ? validationWarnings : undefined,
            validationWarningCount: validationWarnings.length > 0 ? validationWarnings.length : undefined,
            crossRefErrors,
            status,
          },
          tenant.examTypeId
        );
      } catch (parseErr) {
        console.error('[file-api] marksheet validation error', parseErr);
        validationErrors = [`Parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`];
      }
    }

    return json({ success: true, path: resolvedPath, validation: { errors: validationErrors, errorCount: validationErrors.length, warnings: validationWarnings, warningCount: validationWarnings.length }, manifestStatus: status });
  } catch (e: unknown) {
    if (e instanceof WorkspaceScopeError) {
      return json({ success: false, error: 'WORKSPACE_SCOPE_VIOLATION', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

function emptySerializedTenant(tenant: ReturnType<typeof import('$lib/server/mastra/tenant-context')['createTenantContext']>): SerializedTenant {
  return {
    schoolId: tenant.schoolId,
    userId: tenant.userId,
    designationId: tenant.designationId,
    staffId: tenant.staffId,
    classId: tenant.classId,
    sectionId: tenant.sectionId,
    examTypeId: tenant.examTypeId,
    academicId: tenant.academicId,
    className: tenant.className,
    sectionName: tenant.sectionName,
    academicYearTitle: tenant.academicYearTitle,
    userRole: resolveUserRole(tenant.designationId),
  };
}
