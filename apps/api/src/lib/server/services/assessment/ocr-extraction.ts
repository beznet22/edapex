import {
  marksheetAnnotationSchema,
  marksheetAnnotationJsonSchema
} from "../../../schema/marksheet-annotation";
import type { MarksheetAnnotation } from "../../../schema/marksheet-annotation";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";
import { sha256Hex } from "../crypto/digest";
import type { OcrExtraction } from "../ports";

export const OCR_PARSER_VERSION = "mistral-ocr:annotation-1";
export const OCR_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
export const OCR_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_TEXT_BYTES = 1_048_576;

export interface OcrExtractionResult {
  readonly contentHash: string;
  readonly parserVersion: string;
  readonly rawText: string;
  readonly annotation: MarksheetAnnotation | null;
  readonly pageCount: number;
  readonly cached: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseAnnotation = (json: string | null): MarksheetAnnotation | null => {
  if (json === null) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    const result = marksheetAnnotationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
};

const toResult = (
  row: {
    readonly contentSha256: string;
    readonly parserVersion: string;
    readonly rawText: string;
    readonly annotationJson: string | null;
    readonly pageCount: number | null;
  },
  cached: boolean
): OcrExtractionResult => ({
  contentHash: row.contentSha256,
  parserVersion: row.parserVersion,
  rawText: row.rawText,
  annotation: parseAnnotation(row.annotationJson),
  pageCount: row.pageCount ?? 0,
  cached
});

export async function extractOrGetCached(
  ctx: ServiceContext,
  input: { readonly file: Blob; readonly fileName: string }
): Promise<OcrExtractionResult> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  if (input.file.size === 0) {
    throw new ValidationError("The uploaded file is empty", "file");
  }
  if (input.file.size > OCR_MAX_FILE_BYTES) {
    throw new ValidationError("The uploaded file is too large", "file");
  }

  const bytes = new Uint8Array(await input.file.arrayBuffer());
  const contentHash = await sha256Hex(bytes);
  const now = ctx.ports.clock.now();
  const key = { contentSha256: contentHash, parserVersion: OCR_PARSER_VERSION };

  const hit = await ctx.repos.assessments.findOcrCache(scoped, key);
  if (hit !== null && hit.expiresAt > now) {
    await ctx.repos.assessments.touchOcrCache(
      scoped,
      key,
      now,
      now + OCR_CACHE_TTL_SECONDS
    );
    return toResult(hit, true);
  }

  const extraction: OcrExtraction = await ctx.ports.ocr.extract({
    file: input.file,
    fileName: input.fileName,
    annotationJsonSchema: marksheetAnnotationJsonSchema()
  });
  const rawText = extraction.markdown.trim();
  if (rawText.length === 0) {
    throw new ValidationError("OCR produced no text for this file", "file");
  }
  if (new TextEncoder().encode(rawText).byteLength > OCR_MAX_TEXT_BYTES) {
    throw new ValidationError("OCR output is too large; split the document", "file");
  }

  const annotationJson = isRecord(extraction.annotation)
    ? JSON.stringify(extraction.annotation)
    : null;
  const parsed = marksheetAnnotationSchema.safeParse(extraction.annotation);
  const annotation = parsed.success ? parsed.data : null;

  await ctx.repos.assessments.upsertOcrCache(scoped, {
    contentSha256: contentHash,
    parserVersion: OCR_PARSER_VERSION,
    fileName: input.fileName,
    mimeType: input.file.type.length > 0 ? input.file.type : "application/octet-stream",
    sizeBytes: bytes.byteLength,
    pageCount: extraction.pageCount,
    rawText,
    annotationJson,
    createdAt: now,
    lastUsedAt: now,
    hitCount: 0,
    expiresAt: now + OCR_CACHE_TTL_SECONDS
  });

  return {
    contentHash,
    parserVersion: OCR_PARSER_VERSION,
    rawText,
    annotation,
    pageCount: extraction.pageCount,
    cached: false
  };
}

export async function getCachedExtraction(
  ctx: ServiceContext,
  contentHash: string,
  parserVersion: string = OCR_PARSER_VERSION
): Promise<OcrExtractionResult | null> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const now = ctx.ports.clock.now();
  const key = { contentSha256: contentHash, parserVersion };
  const row = await ctx.repos.assessments.findOcrCache(scoped, key);
  if (row === null || row.expiresAt <= now) return null;
  await ctx.repos.assessments.touchOcrCache(
    scoped,
    key,
    now,
    now + OCR_CACHE_TTL_SECONDS
  );
  return toResult(row, true);
}

export async function purgeExpiredOcr(
  ctx: ServiceContext,
  now: number = ctx.ports.clock.now()
): Promise<number> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  return ctx.repos.assessments.deleteExpiredOcrCache(scoped, now);
}
