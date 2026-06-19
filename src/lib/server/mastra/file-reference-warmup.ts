import type { RequestContext } from '@mastra/core/request-context';
import type { WorkspaceFilesystem } from '@mastra/core/workspace';
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import { OcrWorkspaceStore } from '$lib/server/mastra/storage/ocr/ocr-workspace-store';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { FileReference } from '$lib/server/mastra/file-context';

const OCR_MIME_PREFIXES = ['image/', 'application/pdf'] as const;

function needsWarmup(ref: FileReference): boolean {
  if (ref.type !== 'file') return false;
  if (ref.fileId !== undefined) return false;
  if (ref.mimeType === undefined) return false;
  const lower = ref.mimeType.toLowerCase();
  return OCR_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

async function resolveFilesystem(tenant: TenantContext): Promise<WorkspaceFilesystem | null> {
  const rc = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({
    requestContext: rc as RequestContext<unknown>,
  });
  return fs ?? null;
}

export async function warmUpFileReferences(
  tenant: TenantContext,
  refs: FileReference[],
): Promise<FileReference[]> {
  const candidates = refs.filter(needsWarmup);
  if (candidates.length === 0) return refs;

  const fs = await resolveFilesystem(tenant);
  if (!fs) {
    console.warn('[file-reference-warmup] Tenant workspace filesystem unavailable; skipping warm-up');
    return refs;
  }

  await Promise.all(
    candidates.map(async (ref) => {
      try {
        const raw = await fs.readFile(ref.key);
        const buf = typeof raw === 'string' ? Buffer.from(raw, 'utf-8') : raw;
        const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const ocr = await OcrWorkspaceStore.getOrCreate({
          tenant,
          file: bytes,
          fileName: ref.name,
          mimeType: ref.mimeType,
        });
        if (ocr.mistralFileId) {
          ref.fileId = ocr.mistralFileId;
        }
      } catch (err) {
        console.warn(
          `[file-reference-warmup] Failed to warm up ${ref.key}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }),
  );

  return refs;
}
