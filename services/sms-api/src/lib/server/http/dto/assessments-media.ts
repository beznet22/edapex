import type {
  CaptureRow,
  CreateCaptureResult,
  OcrExtractionResult
} from "../../services/assessment";

export interface ExtractionDto {
  readonly contentHash: string;
  readonly parserVersion: string;
  readonly provider: OcrExtractionResult["provider"];
  readonly isLocal: boolean;
  readonly rawText: string;
  readonly annotation: OcrExtractionResult["annotation"];
  readonly pageCount: number;
  readonly warnings: readonly string[];
  readonly cached: boolean;
}

export interface CaptureDto {
  readonly id: string;
  readonly classId: number;
  readonly sectionId: number;
  readonly academicId: number;
  readonly examTypeId: number;
  readonly studentId: number | null;
  readonly fileName: string;
  readonly status: CaptureRow["status"];
  readonly matchMethod: CaptureRow["matchMethod"];
  readonly matchScore: number | null;
  readonly ocrName: string | null;
  readonly ocrAdmissionNo: string | null;
  readonly ocrClassLabel: string | null;
  readonly ocrTerm: string | null;
  readonly ocrCategory: string | null;
  readonly validationJson: string | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly confirmedBy: number | null;
  readonly confirmedAt: number | null;
}

export interface CaptureResultDto {
  readonly capture: CaptureDto;
  readonly extraction: ExtractionDto;
}

export const toExtractionDto = (result: OcrExtractionResult): ExtractionDto => ({
  contentHash: result.contentHash,
  parserVersion: result.parserVersion,
  provider: result.provider,
  isLocal: result.isLocal,
  rawText: result.rawText,
  annotation: result.annotation,
  pageCount: result.pageCount,
  warnings: result.warnings,
  cached: result.cached
});

export const toCaptureDto = (row: CaptureRow): CaptureDto => ({
  id: row.id,
  classId: row.classId,
  sectionId: row.sectionId,
  academicId: row.academicId,
  examTypeId: row.examTypeId,
  studentId: row.studentId,
  fileName: row.fileName,
  status: row.status,
  matchMethod: row.matchMethod,
  matchScore: row.matchScore,
  ocrName: row.ocrName,
  ocrAdmissionNo: row.ocrAdmissionNo,
  ocrClassLabel: row.ocrClassLabel,
  ocrTerm: row.ocrTerm,
  ocrCategory: row.ocrCategory,
  validationJson: row.validationJson,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  confirmedBy: row.confirmedBy,
  confirmedAt: row.confirmedAt
});

export const toCaptureResultDto = (
  result: CreateCaptureResult
): CaptureResultDto => ({
  capture: toCaptureDto(result.capture),
  extraction: toExtractionDto(result.extraction)
});
