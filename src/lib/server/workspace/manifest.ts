/**
 * Workspace manifest — per-examTypeId source of truth.
 *
 * Every manifest lives at:
 *   .workspaces/<schoolId>/AY<id>/<classId>_<sectionId>/exams/examType-<id>/manifest.json
 *
 * There is NO class-root manifest. Every workspace write — including
 * notes/shared/scratch — is scoped to an examTypeId. The resolver rejects
 * writes when classId/sectionId/academicId are missing — there is no
 * `_system/` fallback. Use `MissingTenantScopeError` to detect this
 * condition in callers and surface a "pick a class" prompt.
 *
 * Tracks every artifact in the per-exam scope. Indexed by relative path
 * AND by kind for fast lookups within the exam. Writes are atomic via
 * temp file + rename so concurrent writes don't tear the file.
 *
 * `byKind` is kept (per design decision) for forward compatibility with
 * future cross-exam dashboards. It is populated per-exam and concatenated
 * by `readAllManifests`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { classDir, manifestPath as buildManifestPath } from "./paths";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import { buildWorkspaceRequestContext } from "$lib/server/helpers/chat-helper";
import { tenantWorkspace } from "$lib/server/workspace";

export type MarksheetStatus = 'extracted' | 'formatted' | 'validated' | 'committed' | 'published';

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
  | "scratch"
  | "photo";

export type FileStatus = "Uploaded" | "Extracted" | "Formatted" | "Validated" | "Committed" | "Generated" | "Published" | "Failed";

export interface ManifestEntry {
  path: string;
  kind: ArtifactKind;
  marksheetStatus?: MarksheetStatus;
  status?: FileStatus;
  error?: string;
  /** UUID minted per upload (toolCallId); used as the formatted marksheet's
   *  documentId after stream-document runs. Enables tools to look up uploads
   *  without a separate `extracted/manifest.json`. */
  documentId?: string;
  fileName?: string;
  contentHash?: string;
  studentId?: number;
  admissionNo?: number;
  examTypeId?: number;
  academicId?: number;
  recordId?: number;
  sizeBytes?: number;
  uploadedAt: string;
  modifiedAt: string;
  mimeType?: string;
  /** Zod validation errors from the most recent auto-save parse+validate.
   *  Populated server-side during PUT; consumed client-side for the
   *  floating validation pill and validation viewer. */
  validationErrors?: string[];
  validationErrorCount?: number;
}

export interface WorkspaceManifest {
  version: 1;
  schoolId: number;
  academicYear: { id: number; title: string };
  classId: number;
  sectionId: number;
  /** Identifies which exam this manifest tracks. Always set. */
  examTypeId: number;
  entries: Record<string, ManifestEntry>;
  byKind: {
    marksheets: Array<{ studentId: number; committedAt: string; recordId?: number }>;
    transcripts: Array<{ studentId: number; academicId: number }>;
    ocrUploads: Array<{ fileName: string; contentHash: string; uploadedAt: string }>;
    pdfs: Array<{ name: string; kind: "marksheet" | "transcript"; studentId: number }>;
    notes: Array<{ path: string; modifiedAt: string }>;
    photos: Array<{ contentHash: string; path: string; uploadedAt: string }>;
  };
}

export function emptyManifest(tenant: TenantContext, examTypeId: number): WorkspaceManifest {
  return {
    version: 1,
    schoolId: tenant.schoolId,
    academicYear: {
      id: tenant.academicId ?? 0,
      title: tenant.academicYearTitle ?? ""
    },
    classId: tenant.classId ?? 0,
    sectionId: tenant.sectionId ?? 0,
    examTypeId,
    entries: {},
    byKind: { marksheets: [], transcripts: [], ocrUploads: [], pdfs: [], notes: [], photos: [] }
  };
}

async function resolveWorkspaceFs(tenant: TenantContext) {
  const rc = buildWorkspaceRequestContext(tenant);
  const fs = await tenantWorkspace.resolveFilesystem({ requestContext: rc as never });
  if (!fs) throw new Error("Tenant workspace filesystem not configured");
  return fs;
}

export class WorkspaceScopeError extends Error {
  constructor(message: string = 'WORKSPACE_SCOPE_VIOLATION') {
    super(message);
    this.name = 'WorkspaceScopeError';
  }
}

/**
 * Strict validation: every write function requires a non-null examTypeId.
 * The class root has no manifest. Admin tools without an active class
 * must surface a `MissingTenantScopeError` instead of falling back to a
 * shared `_system/` directory.
 */
function requireExamTypeId(examTypeId: number | null | undefined, op: string): number {
  if (examTypeId == null) {
    throw new WorkspaceScopeError(
      `${op} requires an explicit examTypeId. ` +
        `All workspace files (including notes/shared/scratch) must be scoped to an exam. ` +
        `For admin tools without an active class, surface a MissingTenantScopeError to prompt the user.`
    );
  }
  return examTypeId;
}

export async function readManifest(
  tenant: TenantContext,
  examTypeId: number
): Promise<WorkspaceManifest> {
  const ws = await resolveWorkspaceFs(tenant);
  const rel = buildManifestPath(examTypeId);
  if (!(await ws.exists(rel))) return emptyManifest(tenant, examTypeId);
  const raw = await ws.readFile(rel, { encoding: "utf-8" });
  const text = typeof raw === "string" ? raw : raw.toString("utf-8");
  try {
    const parsed = JSON.parse(text) as WorkspaceManifest;
    if (parsed.version !== 1) return emptyManifest(tenant, examTypeId);
    // Repair missing examTypeId on legacy files (defensive — write path
    // always sets it, so this only matters for files written before the
    // per-exam refactor).
    if (parsed.examTypeId == null) parsed.examTypeId = examTypeId;
    return parsed;
  } catch {
    return emptyManifest(tenant, examTypeId);
  }
}

export async function writeManifest(
  tenant: TenantContext,
  manifest: WorkspaceManifest,
  examTypeId: number
): Promise<void> {
  const validated = requireExamTypeId(examTypeId, "writeManifest");
  const ws = await resolveWorkspaceFs(tenant);
  const rel = buildManifestPath(validated);
  const tmp = `${rel}.tmp-${Date.now()}`;
  // Write the manifest with the validated examTypeId stamped in.
  const out: WorkspaceManifest = { ...manifest, examTypeId: validated };
  await ws.writeFile(tmp, JSON.stringify(out, null, 2), { recursive: true });
  // Atomic rename: remove the old file then move tmp into place.
  // LocalFilesystem doesn't expose rename, so we delete + write.
  if (await ws.exists(rel)) {
    try {
      await fs.unlink(path.join(classDir(tenant), rel));
    } catch {
      // ignore — writeFile overwrites
    }
  }
  const finalRaw = await ws.readFile(tmp, { encoding: "utf-8" });
  await ws.writeFile(rel, finalRaw, { recursive: true });
  try {
    await fs.unlink(path.join(classDir(tenant), tmp));
  } catch {
    // ignore
  }
}

export async function addEntry(
  tenant: TenantContext,
  entry: ManifestEntry,
  examTypeId: number
): Promise<WorkspaceManifest> {
  const validated = requireExamTypeId(examTypeId, "addEntry");
  const m = await readManifest(tenant, validated);
  m.entries[entry.path] = entry;
  // Maintain byKind indexes. Within a single per-exam manifest, the
  // (studentId, examTypeId) tuple is unique by construction — examTypeId
  // is fixed for the whole file. Dedup is purely on studentId here.
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
  } else if (entry.kind === "photo" && entry.contentHash) {
    m.byKind.photos.push({
      contentHash: entry.contentHash,
      path: entry.path,
      uploadedAt: entry.uploadedAt
    });
  }
  await writeManifest(tenant, m, validated);
  return m;
}

export async function removeEntry(
  tenant: TenantContext,
  relPath: string,
  examTypeId: number
): Promise<WorkspaceManifest> {
  const validated = requireExamTypeId(examTypeId, "removeEntry");
  const m = await readManifest(tenant, validated);
  delete m.entries[relPath];
  m.byKind.ocrUploads = m.byKind.ocrUploads.filter((x) => !relPath.endsWith(`ocr/${x.fileName}.md`));
  m.byKind.marksheets = m.byKind.marksheets.filter((x) => !relPath.endsWith(`marksheets/${x.studentId}.json`));
  m.byKind.transcripts = m.byKind.transcripts.filter((x) => !relPath.endsWith(`transcripts/${x.studentId}.json`));
  m.byKind.pdfs = m.byKind.pdfs.filter((x) => x.name !== relPath);
  m.byKind.notes = m.byKind.notes.filter((x) => x.path !== relPath);
  await writeManifest(tenant, m, validated);
  return m;
}

export async function updateEntryStatus(
  tenant: TenantContext,
  relPath: string,
  status: MarksheetStatus,
  examTypeId: number
): Promise<WorkspaceManifest> {
  const validated = requireExamTypeId(examTypeId, "updateEntryStatus");
  const m = await readManifest(tenant, validated);
  const entry = m.entries[relPath];
  if (entry) {
    entry.marksheetStatus = status;
    entry.error = undefined;
    entry.modifiedAt = new Date().toISOString();
  }
  await writeManifest(tenant, m, validated);
  return m;
}

export async function updateEntry(
  tenant: TenantContext,
  relPath: string,
  partial: Partial<ManifestEntry>,
  examTypeId: number
): Promise<WorkspaceManifest> {
  const validated = requireExamTypeId(examTypeId, "updateEntry");
  const m = await readManifest(tenant, validated);
  const entry = m.entries[relPath];
  if (entry) {
    Object.assign(entry, partial, { modifiedAt: new Date().toISOString() });
  }
  await writeManifest(tenant, m, validated);
  return m;
}

/**
 * Read every per-exam manifest for the active class in parallel and
 * return them as an array sorted by examTypeId ascending. Used by
 * cross-exam aggregation pages (filestore, chat resource list, mentions
 * search). Each returned manifest is a per-exam view; callers that
 * need a single merged `entries` map should concatenate themselves.
 */
export async function readAllManifests(tenant: TenantContext): Promise<WorkspaceManifest[]> {
  const ws = await resolveWorkspaceFs(tenant);
  let examTypeIds: number[] = [];
  try {
    // Scan exams/ to discover which per-exam manifests exist on disk.
    // This is a single readdir; we read each manifest in parallel below.
    const entries = await ws.readdir("exams");
    examTypeIds = entries
      .filter((e) => e.type === "directory" && e.name.startsWith("examType-"))
      .map((e) => Number(e.name.slice("examType-".length)))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
  const manifests = await Promise.all(
    examTypeIds.map((id) => readManifest(tenant, id))
  );
  return manifests;
}

/**
 * Remove the entire per-exam scope: the manifest + every artifact
 * directory under it. Used by the uploads DELETE handler with the
 * `?exam=N` query param for partial clean-up.
 */
export async function clearExamArtifacts(
  tenant: TenantContext,
  examTypeId: number
): Promise<void> {
  const validated = requireExamTypeId(examTypeId, "clearExamArtifacts");
  const ws = await resolveWorkspaceFs(tenant);
  const dir = `exams/examType-${validated}`;
  if (await ws.exists(dir)) {
    await ws.rmdir(dir, { recursive: true });
  }
}
