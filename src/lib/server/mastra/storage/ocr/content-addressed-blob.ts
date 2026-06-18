/**
 * Content-addressed blob store for raw marksheet uploads — EdApex
 *
 * Blobs live at `extracted/<contentHash>.<ext>` at the tenant's
 * year-level workspace root, regardless of any active `examTypeId`.
 * Multiple manifest entries that share the same bytes also share a
 * single blob; orphan deletion only happens when no manifest entry
 * still references the hash.
 */
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import type { Manifest } from './manifest-store';

const EXTRACTED_DIR = 'extracted';

function blobPath(contentHash: string, ext: string): string {
  return `${EXTRACTED_DIR}/${contentHash}.${ext}`;
}

async function resolveFilesystem(tenant: TenantContext) {
  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
  if (!fs) throw new Error('Tenant workspace filesystem unavailable');
  return fs;
}

export async function writeBlob(
  tenant: TenantContext,
  contentHash: string,
  ext: string,
  bytes: Buffer | Uint8Array,
): Promise<{ path: string; created: boolean }> {
  const fs = await resolveFilesystem(tenant);
  const path = blobPath(contentHash, ext);
  if (await fs.exists(path)) {
    return { path, created: false };
  }
  await fs.writeFile(path, bytes, { recursive: true });
  return { path, created: true };
}

export async function readBlob(
  tenant: TenantContext,
  contentHash: string,
  ext: string,
): Promise<Buffer> {
  const fs = await resolveFilesystem(tenant);
  const content = await fs.readFile(blobPath(contentHash, ext));
  if (typeof content === 'string') {
    return Buffer.from(content, 'utf-8');
  }
  return content;
}

export async function deleteBlobIfOrphan(
  tenant: TenantContext,
  contentHash: string,
  ext: string,
  manifest: Manifest,
): Promise<boolean> {
  const stillReferenced = manifest.documents.some((doc) => doc.contentHash === contentHash);
  if (stillReferenced) return false;

  const fs = await resolveFilesystem(tenant);
  const path = blobPath(contentHash, ext);
  if (!(await fs.exists(path))) return false;

  await fs.deleteFile(path, { force: true });
  return true;
}
