/**
 * Upload manifest for marksheet OCR — EdApex
 *
 * The manifest is a single JSON document at the tenant's year-level
 * `extracted/manifest.json`. It tracks every uploaded marksheet through
 * its lifecycle (pending review → committed or rejected) and pairs each
 * upload's randomly-generated `documentId` with the content-addressed
 * blob (`contentHash`) on disk.
 *
 * Two uploads with the same bytes (e.g. a resend) share a single blob
 * but get distinct manifest entries; the cleanup primitive in
 * `extracted-cleanup.ts` is responsible for deciding when the underlying
 * blob can finally be freed.
 */
import { tenantWorkspace } from '$lib/server/mastra/storage/workspaces';
import { buildWorkspaceRequestContext } from '$lib/server/helpers/chat-helper';
import type { TenantContext } from '$lib/server/mastra/tenant-context';

export type ManifestStatus = 'pending' | 'committed' | 'rejected';

export interface ManifestStudentHint {
  fullName?: string;
  admissionNo?: number;
}

export interface ManifestEntry {
  documentId: string;
  contentHash: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  status: ManifestStatus;
  studentHint?: ManifestStudentHint;
}

export interface Manifest {
  version: 1;
  documents: ManifestEntry[];
}

const MANIFEST_PATH = 'extracted/manifest.json';

async function resolveFilesystem(tenant: TenantContext) {
  const requestContext = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: requestContext as never });
  if (!fs) throw new Error('Tenant workspace filesystem unavailable');
  return fs;
}

function isManifestEntry(value: unknown): value is ManifestEntry {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.documentId === 'string' &&
    typeof candidate.contentHash === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.mimeType === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.uploadedAt === 'string' &&
    (candidate.status === 'pending' || candidate.status === 'committed' || candidate.status === 'rejected')
  );
}

export async function readManifest(tenant: TenantContext): Promise<Manifest> {
  const fs = await resolveFilesystem(tenant);
  if (!(await fs.exists(MANIFEST_PATH))) {
    return { version: 1, documents: [] };
  }

  const raw = await fs.readFile(MANIFEST_PATH, { encoding: 'utf-8' });
  const text = typeof raw === 'string' ? raw : raw.toString('utf-8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { version: 1, documents: [] };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { version: 1, documents: [] };
  }

  const obj = parsed as Record<string, unknown>;
  const documentsRaw = Array.isArray(obj.documents) ? obj.documents : [];
  const documents = documentsRaw.filter(isManifestEntry);

  return { version: 1, documents };
}

export async function writeManifest(tenant: TenantContext, manifest: Manifest): Promise<void> {
  const fs = await resolveFilesystem(tenant);
  const payload: Manifest = { version: 1, documents: manifest.documents };
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(payload, null, 2), { recursive: true });
}

export async function addDocument(tenant: TenantContext, entry: ManifestEntry): Promise<Manifest> {
  const current = await readManifest(tenant);
  const filtered = current.documents.filter((doc) => doc.documentId !== entry.documentId);
  const updated: Manifest = {
    version: 1,
    documents: [...filtered, entry],
  };
  await writeManifest(tenant, updated);
  return updated;
}

export async function removeDocument(
  tenant: TenantContext,
  documentId: string,
): Promise<{ removed: ManifestEntry | null; updated: Manifest }> {
  const current = await readManifest(tenant);
  const removed = current.documents.find((doc) => doc.documentId === documentId) ?? null;

  if (!removed) {
    return { removed: null, updated: current };
  }

  const updated: Manifest = {
    version: 1,
    documents: current.documents.filter((doc) => doc.documentId !== documentId),
  };
  await writeManifest(tenant, updated);
  return { removed, updated };
}
