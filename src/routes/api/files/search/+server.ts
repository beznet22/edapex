/**
 * Workspace File Search API — EdApex
 *
 * Returns a list of files in the active tenant's workspace directory,
 * optionally filtered by a query string. Used by the chat composer
 * `@file` mention dropdown.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import path from 'node:path';
import fs from 'node:fs';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { resolveActiveClassScope } from '$lib/server/helpers/class-scope';
import { ALLOWED_DESIGNATIONS } from '$lib/types/sms-types';

interface FileSearchResult {
  key: string;
  name: string;
  type: 'file';
  size?: number;
  url?: string;
}

interface FileSearchSuccessResponse {
  results: FileSearchResult[];
}

interface FileSearchErrorResponse {
  error: string;
}

async function resolveRequestTenant({
  locals,
  url,
  cookies,
}: {
  locals: App.Locals;
  url: URL;
  cookies: { get: (name: string) => string | undefined };
}) {
  const scope = await resolveActiveClassScope({
    schoolId: locals.user?.schoolId ?? 1,
    staffId: locals.user?.staffId,
    className: url.searchParams.get('className'),
    sectionName: url.searchParams.get('sectionName'),
    selectedClassCookie: cookies.get('selected-class'),
  });

  if (!scope) {
    throw error(400, 'Unable to resolve active class scope');
  }

  return createTenantContext({
    schoolId: locals.user?.schoolId ?? 1,
    userId: locals.user?.id ?? 1,
    designationId: (locals.user as { designationId?: number } | undefined)?.designationId ?? ALLOWED_DESIGNATIONS.IT,
    staffId: (locals.user as { staffId?: number } | undefined)?.staffId ?? 1,
    classId: scope.classId,
    sectionId: scope.sectionId,
    examId: null,
    examTypeId: null,
    academicId: scope.academicId,
  });
}

function getDirentParentPath(dirent: fs.Dirent): string {
  // Node >= 20.12.0 renamed `path` to `parentPath` on Dirent.
  return dirent.parentPath ?? (dirent as unknown as { path?: string }).path ?? '';
}

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  try {
    if (!locals.user) {
      throw error(401, 'Unauthorized');
    }

    const tenant = await resolveRequestTenant({ locals, url, cookies });

    const yearSeg = `AY${tenant.academicId ?? 0}`;
    const classSeg = `${tenant.classId}_${tenant.sectionId}_${yearSeg}`;
    const workspaceRoot = path.join(process.cwd(), '.workspaces', String(tenant.schoolId), classSeg);

    try {
      await fs.promises.access(workspaceRoot, fs.constants.R_OK);
    } catch {
      return json({ results: [] } satisfies FileSearchSuccessResponse);
    }

    const rawEntries = await fs.promises.readdir(workspaceRoot, { recursive: true, withFileTypes: true });

    const fileEntries = rawEntries.filter((entry) => entry.isFile());

    const fileResults = await Promise.all(
      fileEntries.map(async (entry) => {
        const parentPath = getDirentParentPath(entry);
        const absolutePath = path.join(parentPath, entry.name);
        const relativeKey = path.relative(workspaceRoot, absolutePath).replace(/\\/g, '/');
        const stats = await fs.promises.stat(absolutePath);
        return {
          key: relativeKey,
          name: entry.name,
          type: 'file' as const,
          size: stats.size,
        };
      }),
    );

    let files = fileResults;

    const query = url.searchParams.get('q')?.trim().toLowerCase();
    if (query) {
      files = files.filter((file) => file.name.toLowerCase().includes(query));
    }

    const topKParam = url.searchParams.get('topK');
    const requestedTopK = topKParam ? Number.parseInt(topKParam, 10) : 10;
    const topK = Number.isNaN(requestedTopK) ? 10 : Math.min(Math.max(requestedTopK, 1), 20);

    const limited = files.slice(0, topK);

    const results: FileSearchResult[] = limited.map((file) => ({
      key: file.key,
      name: file.name,
      type: 'file',
      size: file.size,
      url: `/api/file/${file.key}`,
    }));

    return json({ results } satisfies FileSearchSuccessResponse);
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'status' in e && typeof e.status === 'number') {
      throw e;
    }
    const message = e instanceof Error ? e.message : String(e);
    return json({ error: message } satisfies FileSearchErrorResponse, { status: 500 });
  }
};
