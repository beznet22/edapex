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
 */

import type { FileEntry } from "@mastra/core/workspace";

export const EXCLUDED_DIR_PREFIXES = ["ocr/", "scratch/"] as const;

export interface FilterableFileEntry {
  name: string;
  type: string;
}

export function isMentionableFile(entry: FilterableFileEntry): boolean {
  if (entry.type !== "file") return false;
  if (entry.name === "." || entry.name === "..") return false;
  if (entry.name.endsWith(".json")) return false;
  if (EXCLUDED_DIR_PREFIXES.some((p) => entry.name.startsWith(p))) return false;
  return true;
}

export function filterMentionableFiles<T extends FilterableFileEntry>(
  entries: T[]
): T[] {
  return entries.filter(isMentionableFile);
}
