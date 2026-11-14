import type { Marksheet } from "../../../schema/marksheet";
import type { Transcript } from "../../../schema/transcript";
import type {
  ArchiveVersionView,
  CrossSessionHistory,
  MarksheetView,
  TranscriptView
} from "../../services/archive";

export interface RenderPayloadDto<TDocument> {
  readonly templateVersion: "marksheet@1" | "transcript@1" | "transcript-history@1";
  readonly version: number;
  readonly publishedAt: number | null;
  readonly filename: string;
  readonly document: TDocument;
}

export const toMarksheetRenderPayload = (
  view: MarksheetView,
  filename: string
): RenderPayloadDto<Marksheet> => ({
  templateVersion: "marksheet@1",
  version: view.version,
  publishedAt: view.publishedAt,
  filename,
  document: view.document
});

export const toTranscriptRenderPayload = (
  view: TranscriptView,
  filename: string
): RenderPayloadDto<Transcript> => ({
  templateVersion: "transcript@1",
  version: view.version,
  publishedAt: view.publishedAt,
  filename,
  document: view.document
});

export const toHistoryRenderPayload = (
  history: CrossSessionHistory,
  filename: string
): RenderPayloadDto<CrossSessionHistory> => ({
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
