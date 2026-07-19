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
import { auth } from '$lib/server/service/auth.service';
import { tenantWorkspace } from '$lib/server/workspace';
import { assertPathAgentVisible, resolveTenantWorkspace, WorkspaceScopeError } from '$lib/server/workspace/scope';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { ocrBatchService } from '$lib/server/service/ocr-batch.service';
import { mistralOcrService } from '$lib/server/service/mistral-ocr.service';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { addEntry as addWorkspaceEntry, updateEntry } from '$lib/server/workspace/manifest';
import { uploadPath } from '$lib/server/workspace/paths';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import type { SerializedTenant } from '$lib/types/background-tasks';
import type { FileEntry } from '@mastra/core/workspace';

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
        userRole: null
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
      const contentHash = createHash('md5').update(bytes).digest('hex');
      await addWorkspaceEntry(
        tenant,
        {
          path: resolvedPath,
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

    const resolvedPath = resolveScopedPath(tenant, params.path);
    await fs.deleteFile(resolvedPath);
    return json({ success: true });
  } catch (e: unknown) {
    if (e instanceof WorkspaceScopeError) {
      return json({ success: false, error: 'WORKSPACE_SCOPE_VIOLATION', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

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
    if (tenant.classId === null || tenant.sectionId === null) {
      throw error(400, 'Active class context required for upload. Please select a class.');
    }

    const resolvedPath = resolveScopedPath(tenant, params.path);
    const blob = await request.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());

    console.info('[file-api] PUT', {
      userId: locals.user.id,
      schoolId: tenant.schoolId,
      classId: tenant.classId,
      sectionId: tenant.sectionId,
      academicId: tenant.academicId,
      examTypeId: tenant.examTypeId,
      path: resolvedPath,
      size: bytes.length,
      at: new Date().toISOString(),
    });

    await fs.writeFile(resolvedPath, bytes, { recursive: true, overwrite: true });

    const fileName = resolvedPath.split('/').pop() ?? 'upload';
    const contentHash = createHash('md5').update(bytes).digest('hex');
    if (tenant.examTypeId == null) {
      throw error(400, 'EXAM_TYPE_REQUIRED: cannot register a workspace upload without an active examTypeId');
    }
    const manifestRelPath = entryKind === 'note'
      ? (params.path ?? '')
      : uploadPath(fileName, tenant.examTypeId);
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

    return json({ success: true, path: resolvedPath });
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
  };
}
