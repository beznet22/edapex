/**
 * Canonical workspace paths.
 *
 * Every artifact in the tenant workspace is reachable via one of these
 * helpers. The single source of truth — DO NOT compute paths inline in
 * individual tools; always use these helpers.
 *
 * Layout:
 *   .workspaces/<schoolId>/AY<academicId>-<year-slug>/<classId>-<classSlug>_<sectionId>-<sectionSlug>/
 *     manifest.json                       — single manifest tracking every artifact
 *     ocr/<fileName>.md                   — raw OCR markdown (one per upload)
 *     ocr/<fileName>.meta.json            — OCR meta sidecar (mistralFileId, etc.)
 *     marksheets/<studentId>.json         — validated Marksheet JSON (after LLM)
 *     marksheets/<studentId>-<slug>.md    — formatted academic report markdown
 *     transcripts/<studentId>.md         — multi-term transcript markdown
 *     transcripts/<studentId>.json        — transcript data
 *     pdfs/marksheet-<studentId>.pdf      — rendered marksheet PDF
 *     pdfs/transcript-<studentId>.pdf     — rendered transcript PDF
 *     notes/                              — user-defined (anything goes)
 *     shared/                             — shared resources
 *     scratch/                            — temporary work
 *
 * The workspace is a general-purpose storage directory. The user can
 * write any kind of file under any subdirectory.
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

export function classDir(tenant: TenantContext): string {
  const yearSeg = `AY${tenant.academicId ?? 0}-${academicYearSlug(tenant.academicYearTitle, tenant.academicId ?? 0)}`;
  const classSeg = `${tenant.classId}-${classSlug(tenant.className, tenant.classId ?? 0)}`;
  const sectionSeg = `${tenant.sectionId}-${sectionSlug(tenant.sectionName, tenant.sectionId ?? 0)}`;
  return path.join(WORKSPACE_ROOT, String(tenant.schoolId), yearSeg, `${classSeg}_${sectionSeg}`);
}

export function manifestPath(): string {
  return "manifest.json";
}

export function ocrMarkdownPath(fileName: string): string {
  return `ocr/${sanitizeForFilename(fileName)}.md`;
}

/**
 * Original uploaded image path. Used by the @file mention ChatComposer
 * and by re-extraction flows. The image lives alongside the OCR markdown
 * so the user can always re-run OCR on the same source bytes.
 */
export function uploadPath(fileName: string): string {
  return `uploads/${sanitizeForFilename(fileName)}`;
}

export function ocrMetaPath(fileName: string): string {
  return `ocr/${sanitizeForFilename(fileName)}.meta.json`;
}

export function marksheetJsonPath(studentId: number): string {
  return `marksheets/${studentId}.json`;
}

export function marksheetMarkdownPath(input: {
  studentId: number;
  adminNo?: number | null;
  examTypeId?: number | null;
  studentName?: string | null;
}): string {
  if (input.adminNo && input.examTypeId && input.studentName) {
    const safeName = input.studentName.toLowerCase().replace(/\s+/g, '_');
    return `marksheets/ADM${input.adminNo}-${input.examTypeId}-${safeName}.md`;
  }
  const slug = input.studentName ? `-${sanitizeForFilename(input.studentName)}` : "";
  return `marksheets/${input.studentId}${slug}.md`;
}

export function marksheetPdfPath(studentId: number): string {
  return `pdfs/marksheet-${studentId}.pdf`;
}

export function transcriptJsonPath(studentId: number): string {
  return `transcripts/${studentId}.json`;
}

export function transcriptMarkdownPath(studentId: number): string {
  return `transcripts/${studentId}.md`;
}

export function transcriptPdfPath(studentId: number): string {
  return `pdfs/transcript-${studentId}.pdf`;
}
