/**
 * Cleanup primitive for committed/rejected OCR uploads — EdApex
 *
 * Removing a document is a two-step compaction:
 *   1. Drop the manifest entry for the given `documentId`.
 *   2. If no other surviving manifest entry references the same
 *      `contentHash`, also remove the underlying blob.
 *
 * Callers pass the `contentHash` + `ext` they recorded at upload time,
 * so cleanup never has to reconstruct the blob path from disk state.
 */
import type { TenantContext } from '$lib/server/mastra/tenant-context';
import { readManifest, writeManifest, type Manifest } from './manifest-store';
import { deleteBlobIfOrphan } from './content-addressed-blob';

export async function removeCommittedDocument(
  tenant: TenantContext,
  documentId: string,
  contentHash: string,
  ext: string,
): Promise<void> {
  const current = await readManifest(tenant);

  const updated: Manifest = {
    version: 1,
    documents: current.documents.filter((doc) => doc.documentId !== documentId),
  };

  if (updated.documents.length !== current.documents.length) {
    await writeManifest(tenant, updated);
  }

  await deleteBlobIfOrphan(tenant, contentHash, ext, updated);
}
