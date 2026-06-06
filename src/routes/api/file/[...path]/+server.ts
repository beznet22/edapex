/**
 * File API Route — EdApex Workspace
 *
 * Serves the per-tenant workspace filesystem through the Mastra `Workspace`
 * abstraction. Tenant isolation is enforced by `LocalFilesystem({ contained: true })`
 * which blocks path traversal at the framework level — no regex sanitization
 * is needed here.
 *
 * The workspace is resolved per request from the active `tenantContext` in
 * the request context. The `verifyTeacherAssignment` check runs as part of
 * the resolver, so any attempt to access a class the staff member does not
 * teach is rejected before any I/O occurs.
 *
 * Batch OCR actions (`?action=batch-extract|status|finalize`) are routed to
 * `OcrBatchService` and are designed to be called from the dedicated task
 * worker (see `$lib/workers/task-worker.ts`). The worker polls status and
 * finalizes without blocking the main thread.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/service/auth.service';
import { createTenantContext, WorkspaceMismatchError } from '$lib/server/mastra/tenant-context';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { ocrBatchService } from '$lib/server/service/ocr-batch.service';
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

export const GET: RequestHandler = async ({ params, url, locals }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const tenant = createTenantContext({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id,
      designationId: (locals.user as { designationId?: number }).designationId ?? 1,
      staffId: (locals.user as { staffId?: number }).staffId ?? 1,
      classId: (locals.user as { classId?: number | null }).classId ?? null,
      sectionId: (locals.user as { sectionId?: number | null }).sectionId ?? null,
      examId: null,
      examTypeId: null,
      academicId: null,
    });

    const requestContext = buildWorkspaceRequestContext(tenant);
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    const action = url.searchParams.get('action');
    const relPath = safeRelPath(params.path);

    if (action === 'list') {
      const listPath = relPath;
      const entries = await fs.readdir(listPath === '' ? '.' : listPath, { recursive: true });
      const items = entries
        .filter((e) => e.name !== '.' && e.name !== '..')
        .map(entryToWire);
      return json({ success: true, result: { items } });
    }

    if (action === 'batch-status') {
      const jobId = url.searchParams.get('jobId');
      if (!jobId) throw new Error("Missing 'jobId' for batch-status");
      const result = await ocrBatchService.pollBatch(jobId);
      return json({ success: true, ...result });
    }

    if (action === 'download') {
      const content = await fs.readFile(relPath);
      const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
      return new Response(buffer, {
        headers: {
          'Content-Type': contentTypeFor(relPath),
          'Content-Length': buffer.length.toString(),
          'Content-Disposition': `attachment; filename="${relPath.split('/').pop() ?? 'download'}"`,
        },
      });
    }

    const content = await fs.readFile(relPath);
    const buffer = typeof content === 'string' ? new TextEncoder().encode(content) : new Uint8Array(content);
    return new Response(buffer, {
      headers: {
        'Content-Type': contentTypeFor(relPath),
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e: unknown) {
    if (e instanceof WorkspaceMismatchError) {
      return json({ success: false, error: 'WORKSPACE_MISMATCH', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

export const POST: RequestHandler = async ({ params, url, request, locals }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const tenant = createTenantContext({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id,
      designationId: (locals.user as { designationId?: number }).designationId ?? 1,
      staffId: (locals.user as { staffId?: number }).staffId ?? 1,
      classId: (locals.user as { classId?: number | null }).classId ?? null,
      sectionId: (locals.user as { sectionId?: number | null }).sectionId ?? null,
      examId: null,
      examTypeId: null,
      academicId: null,
    });

    const requestContext = buildWorkspaceRequestContext(tenant);
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    const action = url.searchParams.get('action');
    const relPath = safeRelPath(params.path);

    if (action === 'rename') {
      const toParam = url.searchParams.get('to');
      if (!toParam) throw new Error("Missing 'to' parameter for rename");
      const toRel = toParam.replace(/^\/+/, '');
      await fs.moveFile(relPath, toRel, { overwrite: true });
      return json({ success: true, path: toRel });
    }

    if (action === 'batch-extract') {
      const body = (await request.json()) as { keys?: string[]; tenant?: SerializedTenant };
      const keys = body.keys ?? [];
      if (keys.length === 0) throw new Error('No keys supplied for batch-extract');
      const result = await ocrBatchService.startBatch(body.tenant ?? emptySerializedTenant(tenant), keys);
      return json({ success: true, ...result });
    }

    if (action === 'batch-finalize') {
      const body = (await request.json()) as { jobId?: string; keys?: string[]; tenant?: SerializedTenant };
      if (!body.jobId) throw new Error("Missing 'jobId' for batch-finalize");
      const keys = body.keys ?? [];
      if (keys.length === 0) throw new Error('No keys supplied for batch-finalize');
      const result = await ocrBatchService.finalizeBatch(body.tenant ?? emptySerializedTenant(tenant), body.jobId, keys);
      return json({ success: true, ...result });
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

    await fs.writeFile(relPath, bytes, { recursive: true, overwrite: true });
    return json({ success: true, path: relPath });
  } catch (e: unknown) {
    if (e instanceof WorkspaceMismatchError) {
      return json({ success: false, error: 'WORKSPACE_MISMATCH', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const tenant = createTenantContext({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id,
      designationId: (locals.user as { designationId?: number }).designationId ?? 1,
      staffId: (locals.user as { staffId?: number }).staffId ?? 1,
      classId: (locals.user as { classId?: number | null }).classId ?? null,
      sectionId: (locals.user as { sectionId?: number | null }).sectionId ?? null,
      examId: null,
      examTypeId: null,
      academicId: null,
    });

    const requestContext = buildWorkspaceRequestContext(tenant);
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    const relPath = safeRelPath(params.path);
    await fs.deleteFile(relPath);
    return json({ success: true });
  } catch (e: unknown) {
    if (e instanceof WorkspaceMismatchError) {
      return json({ success: false, error: 'WORKSPACE_MISMATCH', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

export const PUT: RequestHandler = async ({ params, request, locals }) => {
  try {
    if (!locals.user) throw error(401, 'Unauthorized');

    const tenant = createTenantContext({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id,
      designationId: (locals.user as { designationId?: number }).designationId ?? 1,
      staffId: (locals.user as { staffId?: number }).staffId ?? 1,
      classId: (locals.user as { classId?: number | null }).classId ?? null,
      sectionId: (locals.user as { sectionId?: number | null }).sectionId ?? null,
      examId: null,
      examTypeId: null,
      academicId: null,
    });

    const requestContext = buildWorkspaceRequestContext(tenant);
    const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
    if (!fs) throw error(500, 'Workspace filesystem unavailable');

    const relPath = safeRelPath(params.path);
    const blob = await request.blob();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    await fs.writeFile(relPath, bytes, { recursive: true, overwrite: true });
    return json({ success: true, path: relPath });
  } catch (e: unknown) {
    if (e instanceof WorkspaceMismatchError) {
      return json({ success: false, error: 'WORKSPACE_MISMATCH', message: e.message }, { status: 403 });
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ success: false, error: message }, { status: 400 });
  }
};

/**
 * Build a `SerializedTenant` snapshot from a `TenantContext`. Used by the
 * batch-OCR endpoints to forward the active tenant into the worker (the
 * worker re-rehydrates the context on the server side).
 */
function emptySerializedTenant(tenant: ReturnType<typeof createTenantContext>): SerializedTenant {
  return {
    schoolId: tenant.schoolId,
    userId: tenant.userId,
    designationId: tenant.designationId,
    staffId: tenant.staffId,
    classId: tenant.classId,
    sectionId: tenant.sectionId,
    examTypeId: tenant.examTypeId,
    academicId: tenant.academicId,
  };
}
