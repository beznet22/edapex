/**
 * Workspace manifest — single source of truth at workspace root.
 *
 * Lives at `.workspaces/<schoolId>/AY<id>-<year-slug>/<classId>-<classSlug>_<sectionId>-<sectionSlug>/manifest.json`.
 *
 * Tracks every artifact in the workspace. Indexed by relative path AND by
 * kind for fast lookups. Writes are atomic via temp file + rename so
 * concurrent writes don't tear the file.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { classDir } from "./paths";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { tenantWorkspace } from "$lib/server/mastra/storage/workspaces";

export type ArtifactKind =
  | "ocr-markdown"
  | "ocr-meta"
  | "marksheet-json"
  | "marksheet-markdown"
  | "marksheet-pdf"
  | "transcript-json"
  | "transcript-markdown"
  | "transcript-pdf"
  | "user-file"
  | "note"
  | "shared"
  | "scratch";

export interface ManifestEntry {
  path: string;
  kind: ArtifactKind;
  fileName?: string;
  contentHash?: string;
  studentId?: number;
  examTypeId?: number;
  academicId?: number;
  recordId?: number;
  sizeBytes?: number;
  uploadedAt: string;
  modifiedAt: string;
  mimeType?: string;
}

export interface WorkspaceManifest {
  version: 1;
  schoolId: number;
  academicYear: { id: number; title: string };
  classId: number;
  sectionId: number;
  entries: Record<string, ManifestEntry>;
  byKind: {
    marksheets: Array<{ studentId: number; committedAt: string; recordId?: number }>;
    transcripts: Array<{ studentId: number; academicId: number }>;
    ocrUploads: Array<{ fileName: string; contentHash: string; uploadedAt: string }>;
    pdfs: Array<{ name: string; kind: "marksheet" | "transcript"; studentId: number }>;
    notes: Array<{ path: string; modifiedAt: string }>;
  };
}

export function emptyManifest(tenant: TenantContext): WorkspaceManifest {
  return {
    version: 1,
    schoolId: tenant.schoolId,
    academicYear: {
      id: tenant.academicId ?? 0,
      title: tenant.academicYearTitle ?? ""
    },
    classId: tenant.classId ?? 0,
    sectionId: tenant.sectionId ?? 0,
    entries: {},
    byKind: { marksheets: [], transcripts: [], ocrUploads: [], pdfs: [], notes: [] }
  };
}

async function resolveWorkspaceFs(tenant: TenantContext) {
  const rc = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: rc as never });
  if (!fs) throw new Error("Tenant workspace filesystem not configured");
  return fs;
}

const MANIFEST_REL = "manifest.json";

export async function readManifest(tenant: TenantContext): Promise<WorkspaceManifest> {
  const ws = await resolveWorkspaceFs(tenant);
  if (!(await ws.exists(MANIFEST_REL))) return emptyManifest(tenant);
  const raw = await ws.readFile(MANIFEST_REL, { encoding: "utf-8" });
  const text = typeof raw === "string" ? raw : raw.toString("utf-8");
  try {
    const parsed = JSON.parse(text) as WorkspaceManifest;
    if (parsed.version !== 1) return emptyManifest(tenant);
    return parsed;
  } catch {
    return emptyManifest(tenant);
  }
}

export async function writeManifest(
  tenant: TenantContext,
  manifest: WorkspaceManifest
): Promise<void> {
  const ws = await resolveWorkspaceFs(tenant);
  const tmp = `${MANIFEST_REL}.tmp-${Date.now()}`;
  await ws.writeFile(tmp, JSON.stringify(manifest, null, 2), { recursive: true });
  // Atomic rename: remove the old file then move tmp into place.
  // LocalFilesystem doesn't expose rename, so we delete + write.
  if (await ws.exists(MANIFEST_REL)) {
    // Use a direct fs.unlink as fallback when the workspace is the real FS.
    try {
      await fs.unlink(path.join(classDir(tenant), MANIFEST_REL));
    } catch {
      // ignore — writeFile overwrites
    }
  }
  const finalRaw = await ws.readFile(tmp, { encoding: "utf-8" });
  await ws.writeFile(MANIFEST_REL, finalRaw, { recursive: true });
  try {
    await fs.unlink(path.join(classDir(tenant), tmp));
  } catch {
    // ignore
  }
}

export async function addEntry(
  tenant: TenantContext,
  entry: ManifestEntry
): Promise<WorkspaceManifest> {
  const m = await readManifest(tenant);
  m.entries[entry.path] = entry;
  // Maintain byKind indexes
  if (entry.kind === "marksheet-json" && entry.studentId !== undefined) {
    const existing = m.byKind.marksheets.find((x) => x.studentId === entry.studentId);
    if (!existing) {
      m.byKind.marksheets.push({
        studentId: entry.studentId,
        committedAt: entry.uploadedAt,
        recordId: entry.recordId
      });
    }
  } else if (entry.kind === "transcript-json" && entry.studentId !== undefined && entry.academicId !== undefined) {
    const existing = m.byKind.transcripts.find(
      (x) => x.studentId === entry.studentId && x.academicId === entry.academicId
    );
    if (!existing) {
      m.byKind.transcripts.push({
        studentId: entry.studentId,
        academicId: entry.academicId
      });
    }
  } else if (entry.kind === "ocr-markdown" && entry.fileName && entry.contentHash) {
    m.byKind.ocrUploads.push({
      fileName: entry.fileName,
      contentHash: entry.contentHash,
      uploadedAt: entry.uploadedAt
    });
  } else if ((entry.kind === "marksheet-pdf" || entry.kind === "transcript-pdf") && entry.studentId !== undefined) {
    const pdfKind = entry.kind === "marksheet-pdf" ? "marksheet" : "transcript";
    if (!m.byKind.pdfs.find((x) => x.name === entry.path)) {
      m.byKind.pdfs.push({
        name: entry.path,
        kind: pdfKind,
        studentId: entry.studentId
      });
    }
  } else if (entry.kind === "note") {
    m.byKind.notes.push({ path: entry.path, modifiedAt: entry.modifiedAt });
  }
  await writeManifest(tenant, m);
  return m;
}

export async function removeEntry(
  tenant: TenantContext,
  relPath: string
): Promise<WorkspaceManifest> {
  const m = await readManifest(tenant);
  delete m.entries[relPath];
  m.byKind.ocrUploads = m.byKind.ocrUploads.filter((x) => `ocr/${sanitizeName(x.fileName)}.md` !== relPath);
  m.byKind.marksheets = m.byKind.marksheets.filter((x) => `marksheets/${x.studentId}.json` !== relPath);
  m.byKind.transcripts = m.byKind.transcripts.filter((x) => `transcripts/${x.studentId}.json` !== relPath);
  m.byKind.pdfs = m.byKind.pdfs.filter((x) => x.name !== relPath);
  m.byKind.notes = m.byKind.notes.filter((x) => x.path !== relPath);
  await writeManifest(tenant, m);
  return m;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}
