import type { ServiceContext } from "../context";
import * as extraction from "./ocr-extraction";
import type { LocalOcrInput, OcrExtractionResult } from "./ocr-extraction";

export class AssessmentOcrService {
  constructor(private readonly ctx: ServiceContext) {}

  async runExtraction(input: {
    readonly file: Blob;
    readonly fileName: string;
  }): Promise<OcrExtractionResult> {
    return extraction.extractOrGetCached(this.ctx, input);
  }

  async runLocalExtraction(input: LocalOcrInput): Promise<OcrExtractionResult> {
    return extraction.extractLocal(this.ctx, input);
  }

  async getCachedExtraction(
    contentHash: string,
    parserVersion?: string
  ): Promise<OcrExtractionResult | null> {
    return extraction.getCachedExtraction(this.ctx, contentHash, parserVersion);
  }

  async purgeExpired(now?: number): Promise<number> {
    return extraction.purgeExpiredOcr(this.ctx, now);
  }
}
