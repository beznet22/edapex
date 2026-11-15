/**
 * Canonical workspace paths.
 *
 * Every artifact in the tenant workspace is reachable via one of these
 * helpers. The single source of truth — DO NOT compute paths inline in
 * individual tools; always use these helpers.
 *
 * Layout (per examTypeId — strict, no class-root fallback for content):
 *   .workspaces/<schoolId>/AY<academicId>-<year-slug>/<classId>-<classSlug>_<sectionId>-<sectionSlug>/
 *     exams/examType-{id}/
 *       manifest.json                  — per-exam manifest tracking every artifact
 *       uploads/<fileName>             — original uploaded images
 *       ocr/<fileName>.md              — raw OCR markdown (one per upload)
 *       ocr/<fileName>.meta.json       — OCR meta sidecar (mistralFileId, etc.)
 *       marksheets/<studentId>.json    — validated Marksheet JSON (after LLM)
 *       marksheets/<studentId>-<slug>.md — formatted academic report markdown
 *       transcripts/<studentId>.md     — multi-term transcript markdown
 *       transcripts/<studentId>.json   — transcript data
 *       pdfs/marksheet-<studentId>.pdf — rendered marksheet PDF
 *       pdfs/transcript-<studentId>.pdf — rendered transcript PDF
 *       notes/                         — user-defined per-exam notes
 *       shared/                        — per-exam shared resources
 *       scratch/                       — per-exam temporary work
 *
 * Every workspace write (including notes/shared/scratch) must be scoped
 * to an examTypeId. The resolver rejects writes when classId/sectionId/
 * academicId are missing — there is no `_system/` fallback. The
 * `SYSTEM_WORKSPACE` constant below is retained as an internal path
 * marker for tooling/migration scripts and is NOT exported from the
 * public barrel.
 *
 * The path builders (ocrMarkdownPath, uploadPath, etc.) keep an optional
 * `examTypeId` for callers that legitimately need to compute a path
 * without knowing the exam (e.g. defensive fallback in OCR caching).
 * The manifest write layer (see manifest.ts) is strict and throws when
 * examTypeId is null/undefined.
 */
import path from "node:path";
import type { TenantContext } from "$lib/server/mastra/tenant-context";
import {
  classSlug,
  sectionSlug,
  academicYearSlug,
  sanitizeForFilename
} from "./slug";

export const WORKSPACE_ROOT = path.resolve(process.cwd(), ".workspaces");
export const SYSTEM_WORKSPACE = path.join(WORKSPACE_ROOT, "_system");

function examPrefix(examTypeId?: number | null): string {
  if (examTypeId == null) return '';
  return `exams/examType-${examTypeId}/`;
}

export function classDir(tenant: TenantContext): string {
  const yearSeg = `AY${tenant.academicId ?? 0}-${academicYearSlug(tenant.academicYearTitle, tenant.academicId ?? 0)}`;
  const classSeg = `${tenant.classId}-${classSlug(tenant.className, tenant.classId ?? 0)}`;
  const sectionSeg = `${tenant.sectionId}-${sectionSlug(tenant.sectionName, tenant.sectionId ?? 0)}`;
  return path.join(WORKSPACE_ROOT, String(tenant.schoolId), yearSeg, `${classSeg}_${sectionSeg}`);
}

/**
 * Per-exam manifest path. examTypeId is REQUIRED — there is no
 * class-root manifest. Every workspace (including notes/shared/scratch)
 * is scoped to an exam.
 */
export function manifestPath(examTypeId: number): string {
  return `exams/examType-${examTypeId}/manifest.json`;
}

/**
 * Per-exam subdirectory paths. The `kind` argument is one of
 * "uploads" | "ocr" | "marksheets" | "transcripts" | "pdfs" |
 * "notes" | "shared" | "scratch". Used by the manifest read/write
 * paths to build canonical relPath values.
 */
export function examDir(examTypeId: number, kind: "uploads" | "ocr" | "marksheets" | "transcripts" | "pdfs" | "notes" | "shared" | "scratch"): string {
  return `exams/examType-${examTypeId}/${kind}`;
}

export function ocrMarkdownPath(fileName: string, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}ocr/${sanitizeForFilename(fileName)}.md`;
}

/**
 * Original uploaded image path. Used by the @file mention ChatComposer
 * and by re-extraction flows. The image lives alongside the OCR markdown
 * so the user can always re-run OCR on the same source bytes.
 */
export function uploadPath(fileName: string, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}uploads/${sanitizeForFilename(fileName)}`;
}

export function ocrMetaPath(fileName: string, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}ocr/${sanitizeForFilename(fileName)}.meta.json`;
}

export function marksheetJsonPath(studentId: number, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}marksheets/${studentId}.json`;
}

export function marksheetMarkdownPath(input: {
  studentId: number;
  adminNo?: number | null;
  examTypeId?: number | null;
  studentName?: string | null;
}): string {
  const prefix = examPrefix(input.examTypeId);
  if (input.adminNo && input.examTypeId && input.studentName) {
    const safeName = input.studentName.toLowerCase().replace(/\s+/g, '_');
    return `${prefix}marksheets/ADM${input.adminNo}-${input.examTypeId}-${safeName}.md`;
  }
  const slug = input.studentName ? `-${sanitizeForFilename(input.studentName)}` : "";
  return `${prefix}marksheets/${input.studentId}${slug}.md`;
}

export function marksheetPdfPath(
  studentId: number,
  admissionNo?: number | null,
  studentFullName?: string | null,
  examTypeId?: number | null,
): string {
  const prefix = examPrefix(examTypeId);
  const safeName = studentFullName
    ? studentFullName.replace(/\s+/g, '_')
    : `student-${studentId}`;
  return `${prefix}pdfs/ADM${admissionNo ?? 0}-${studentId}-${sanitizeForFilename(safeName)}.pdf`;
}

export function transcriptJsonPath(studentId: number, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}transcripts/${studentId}.json`;
}

export function transcriptMarkdownPath(studentId: number, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}transcripts/${studentId}.md`;
}

export function transcriptPdfPath(studentId: number, examTypeId?: number | null): string {
  return `${examPrefix(examTypeId)}pdfs/transcript-${studentId}.pdf`;
}

/**
 * Photo file path, flat at class root (not exam-scoped). Photos span all
 * exam types within a class/section — the same photo is visible across
 * every per-exam manifest via readAllManifests.
 */
export function photoPath(contentHash: string, ext: string): string {
  return `photos/${contentHash}.${ext}`;
}

/**
 * Academic year root directory — one level above the class root. Shared
 * resources (e.g. cross-class photo pools, shared documents) live here so
 * they span every class/section within a single academic year.
 *
 *   .workspaces/<schoolId>/AY<academicId>-<year-slug>/
 */
export function academicYearDir(tenant: TenantContext): string {
	const yearSeg = `AY${tenant.academicId ?? 0}-${academicYearSlug(tenant.academicYearTitle, tenant.academicId ?? 0)}`;
	return path.join(WORKSPACE_ROOT, String(tenant.schoolId), yearSeg);
}

/**
 * Shared directory at the academic year root. General-purpose home for any
 * file that should be visible to every class in the same academic year.
 * The `shared/photos/` subdir holds the cross-class photo claim pool.
 */
export function sharedDir(tenant: TenantContext): string {
	return path.join(academicYearDir(tenant), "shared");
}

/**
 * Photos subdirectory within the shared dir. Files here are imported via
 * `kind: "import-photos"` (see `$lib/workers/task-worker.ts`) and claimed
 * to a specific student via `POST /api/photos/claim`.
 */
export function sharedPhotosDir(tenant: TenantContext): string {
	return path.join(sharedDir(tenant), "photos");
}
