import type {
  Marksheet
} from "../../../schema/marksheet";
import type { Transcript } from "../../../schema/transcript";
import type {
  MarkResponse,
  PublishResultsResult,
  PublishTranscriptResult
} from "../../services/assessment";

export type MarksheetDto = Marksheet;

export interface StudentResultDto {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly results: MarkResponse["results"];
}

export interface PublishResultsDto {
  readonly sent: number;
  readonly failed: number;
  readonly errors: readonly string[];
  readonly results: PublishResultsResult["results"];
}

export interface PublishTranscriptDto {
  readonly message: string;
  readonly messageId?: string;
}

export type TranscriptDto = Transcript;

export const toMarksheetDto = (marksheet: Marksheet): MarksheetDto => marksheet;

export const toStudentResultDto = (result: MarkResponse): StudentResultDto => ({
  studentId: result.studentId,
  examTypeId: result.examTypeId,
  results: result.results
});

export const toPublishResultsDto = (
  result: PublishResultsResult
): PublishResultsDto => ({
  sent: result.sent,
  failed: result.failed,
  errors: result.errors,
  results: result.results
});

export const toPublishTranscriptDto = (
  result: PublishTranscriptResult
): PublishTranscriptDto => ({
  message: result.message,
  ...(result.messageId === undefined ? {} : { messageId: result.messageId })
});

export const toTranscriptDto = (transcript: Transcript): TranscriptDto =>
  transcript;
