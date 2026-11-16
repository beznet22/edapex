/**
 * File mention filter — shared between the filestore page and the
 * `/api/mentions/search?category=file` endpoint.
 *
 * Both surfaces must agree on what counts as a "mentionable" file —
 * a user who can't see a file in the filestore library shouldn't be
 * able to @-mention it. This module is the single source of truth.
 *
 * Excluded:
 *   - Non-file entries (directories, symlinks, etc.)
 *   - `.` and `..` directory markers
 *   - `.json` data files (manifest entries, sidecars)
 *   - Anything under `ocr/` or `scratch/` (auto-generated artefacts)
 *   - The same prefixes when nested under `exams/examType-{id}/` —
 *     marksheets/transcripts share per-exam subdirectories and the
 *     raw OCR scratch should never surface in the @-mention list.
 */

import type { FileEntry } from "@mastra/core/workspace";

export const EXCLUDED_TOP_DIRS = ["ocr", "scratch"] as const;

export interface FilterableFileEntry {
  name: string;
  type: string;
}

function isExcludedSegment(name: string): boolean {
  // Split a relative path into segments and return true if any leading
  // segment (before the filename) is an excluded directory. Handles both
  // legacy paths like `ocr/foo.md` and grouped paths like
  // `exams/examType-1/ocr/foo.md`.
  const segments = name.split("/");
  // Drop the filename (last segment); keep only directories.
  const dirs = segments.slice(0, -1);
  // For paths like `exams/examType-1/ocr/foo.md`, dirs = ['exams', 'examType-1', 'ocr']
  // We want to exclude the leaf directory when it is in the blocklist.
  const leaf = dirs[dirs.length - 1];
  return EXCLUDED_TOP_DIRS.includes(leaf as (typeof EXCLUDED_TOP_DIRS)[number]);
}

export function isMentionableFile(entry: FilterableFileEntry): boolean {
  if (entry.type !== "file") return false;
  if (entry.name === "." || entry.name === "..") return false;
  if (entry.name.endsWith(".json")) return false;
  if (isExcludedSegment(entry.name)) return false;
  return true;
}

export function filterMentionableFiles<T extends FilterableFileEntry>(
  entries: T[]
): T[] {
  return entries.filter(isMentionableFile);
}
