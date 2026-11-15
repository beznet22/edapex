import type {
  MarksheetPayload,
  TranscriptHistoryPayload,
  TranscriptPayload
} from "@edapex/contracts";

import type {
  ArchiveVersionView,
  CrossSessionHistory,
  MarksheetView,
  TranscriptView
} from "../../services/archive";

/**
 * The payload types live in `@edapex/contracts` so the client renderer is checked
 * against the same declaration. Declaring them here too would let the client and server
 * drift while both compiled.
 */
export const toMarksheetRenderPayload = (
  view: MarksheetView,
  filename: string
): MarksheetPayload => ({
  templateVersion: "marksheet@1",
  version: view.version,
  publishedAt: view.publishedAt,
  filename,
  document: view.document
});

export const toTranscriptRenderPayload = (
  view: TranscriptView,
  filename: string
): TranscriptPayload => ({
  templateVersion: "transcript@1",
  version: view.version,
  publishedAt: view.publishedAt,
  filename,
  document: view.document
});

export const toHistoryRenderPayload = (
  history: CrossSessionHistory,
  filename: string
): TranscriptHistoryPayload => ({
  templateVersion: "transcript-history@1",
  version: 0,
  publishedAt: null,
  filename,
  document: history
});

export interface ArchiveVersionDto {
  readonly id: number;
  readonly version: number;
  readonly status: string;
  readonly publishedAt: number | null;
  readonly publishedBy: number | null;
  readonly reason: string | null;
  readonly checksum: string;
  readonly bytes: number;
  readonly schemaVersion: number;
}

export const toArchiveVersionDto = (view: ArchiveVersionView): ArchiveVersionDto => ({
  id: view.id,
  version: view.version,
  status: view.status,
  publishedAt: view.publishedAt,
  publishedBy: view.publishedBy,
  reason: view.reason,
  checksum: view.checksum,
  bytes: view.bytes,
  schemaVersion: view.schemaVersion
});
