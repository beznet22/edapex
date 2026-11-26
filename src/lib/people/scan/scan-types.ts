/**
 * Client-safe scan vocabulary.
 *
 * Duplicated deliberately rather than imported from `$lib/server/people/scan/*`: `$lib/server`
 * cannot be pulled into a client component, and a component importing it would break the build.
 * Keeping the labels in one place means the badge and the roster cannot drift.
 */

export const SCAN_UI_LABELS = {
  not_uploaded: "Not Uploaded",
  queued: "Queued",
  extracting: "Extracting",
  draft: "Draft",
  committed: "Uploaded",
  published: "Published",
  failed: "Error",
} as const;

export type ScanUiStatus = keyof typeof SCAN_UI_LABELS;

export const isBusyStatus = (status: ScanUiStatus): boolean =>
  status === "queued" || status === "extracting";
