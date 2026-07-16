/**
 * Workspace File Search API — EdApex
 *
 * Returns a list of files in the active tenant's workspace directory,
 * optionally filtered by a query string. Used by the chat composer
 * `@file` mention dropdown.
 *
 * Uses `resolveTenantWorkspace` (the central workspace resolver) so the
 * search always lands on the correct human-readable workspace path.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { resolveTenantWorkspace } from '$lib/server/workspace/scope';
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

export const GET: RequestHandler = async ({ url, locals, cookies }) => {
  try {
    if (!locals.user) {
      throw error(401, 'Unauthorized');
    }

    const { fs } = await resolveTenantWorkspace({
      schoolId: locals.user.schoolId ?? 1,
      userId: locals.user.id ?? 1,
      staffId: (locals.user as { staffId?: number })?.staffId,
      designationId: (locals.user as { designationId?: number })?.designationId ?? ALLOWED_DESIGNATIONS.IT,
      className: url.searchParams.get('className'),
      sectionName: url.searchParams.get('sectionName'),
      selectedClassCookie: cookies.get('selected-class'),
    });

    let entries: Array<{ name: string; type: string; size?: number }> = [];
    try {
      entries = await fs.readdir('.', { recursive: true });
    } catch {
      return json({ results: [] } satisfies FileSearchSuccessResponse);
    }

    const fileEntries = entries.filter((e) => e.type === 'file');

    const fileResults = fileEntries.map((entry) => ({
      key: entry.name,
      name: entry.name.split('/').pop() ?? entry.name,
      type: 'file' as const,
      size: entry.size,
    }));

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
