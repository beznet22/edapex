/**
 * Start Chat With Files — EdApex
 *
 * Server endpoint called from the Library when the user clicks
 * "Start chat" on a single file (or in the future: a small set of files).
 * Behaviour:
 *   1. For each image/pdf, run Mistral OCR via `OcrWorkspaceStore` to
 *      produce a `contentHash` + `mistralFileId` (cache-hit on re-run).
 *   2. Build a `FileReference[]` matching the shape `ChatContext.fileReferences`
 *      expects (see `$lib/context/chat-context.svelte.ts`).
 *   3. Create a fresh Mastra memory thread owned by the current user.
 *   4. Persist the file references in the thread's metadata so the chat
 *      side can rehydrate them on mount without a separate roundtrip.
 *   5. Return `{ threadId, fileReferences }` so the client can stash
 *      them in localStorage as a belt-and-braces hydration path.
 */
import { json, error, type RequestHandler } from '@sveltejs/kit';
import { getMemory } from '$lib/server/mastra';
import { createTenantContext } from '$lib/server/mastra/tenant-context';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import { resolveExamTypeId } from '$lib/server/mastra/tenant-context';

type StartFile = {
  key: string;
  name: string;
  mimeType: string;
  kind: 'image' | 'pdf' | 'document' | 'unsupported';
};

type FileReference = {
  key: string;
  name: string;
  type: 'file';
  mimeType?: string;
  fileId?: string;
  contentHash?: string;
};

function mimeForKind(kind: StartFile['kind']): string {
  switch (kind) {
    case 'pdf': return 'application/pdf';
    case 'image': return 'image/jpeg';
    default: return 'application/octet-stream';
  }
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  const body = (await request.json()) as { files?: StartFile[] };
  const files = body.files ?? [];
  if (files.length === 0) throw error(400, 'No files supplied');

  const schoolId = locals.user.schoolId ?? 1;
  const examTypeId = await resolveExamTypeId(schoolId, null);
  const tenant = createTenantContext({
    schoolId,
    userId: locals.user.id,
    designationId: (locals.user as { designationId?: number }).designationId ?? ALLOWED_DESIGNATIONS.IT,
    staffId: (locals.user as { staffId?: number }).staffId ?? 1,
    classId: (locals.user as { classId?: number | null }).classId ?? null,
    sectionId: (locals.user as { sectionId?: number | null }).sectionId ?? null,
    examTypeId,
    academicId: null,
  });

  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
  if (!fs) throw error(500, 'Workspace filesystem unavailable');

  const fileReferences: FileReference[] = [];
  for (const file of files) {
    const baseRef: FileReference = {
      key: file.key,
      name: file.name,
      type: 'file',
      mimeType: file.mimeType || mimeForKind(file.kind),
    };

    if (file.kind === 'image' || file.kind === 'pdf') {
      try {
        const buf = await fs.readFile(file.key);
        const bytes = typeof buf === 'string' ? new TextEncoder().encode(buf) : new Uint8Array(buf);
        const ocr = await OcrWorkspaceStore.getOrCreate({
          tenant,
          file: bytes,
          fileName: file.name,
          mimeType: file.mimeType || mimeForKind(file.kind),
        });
        fileReferences.push({
          ...baseRef,
          fileId: ocr.mistralFileId || undefined,
          contentHash: ocr.contentHash,
        });
      } catch (err) {
        // OCR failure is non-fatal: ship the file as a binary reference so
        // the agent can at least see the metadata. The injectFileContext
        // fallback will render it as `[File: name, Type: mime, Size: size]`.
        console.error('[start-with-files] OCR failed for', file.key, err);
        fileReferences.push(baseRef);
      }
    } else {
      fileReferences.push(baseRef);
    }
  }

  const memory = await getMemory();
  if (!memory) throw error(500, 'Memory not configured');

  const threadId = crypto.randomUUID();
  const resourceId = `user-${locals.user.id}`;
  const firstName = files[0]?.name ?? 'file';
  const title = `Started from ${firstName}`.slice(0, 80);

  await memory.createThread({
    threadId,
    resourceId,
    title,
    metadata: {
      source: 'library',
      initialFileReferences: fileReferences,
    },
  });

  return json({ success: true, threadId, fileReferences });
};
