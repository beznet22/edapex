export interface OcrExtractionInput {
  readonly file: Blob;
  readonly fileName: string;
  readonly annotationJsonSchema: Readonly<Record<string, unknown>>;
}

export interface OcrExtraction {
  readonly markdown: string;
  /** Parsed `document_annotation`; `null` when the provider omitted it. */
  readonly annotation: unknown;
  readonly pageCount: number;
}

export interface OcrClient {
  extract(input: OcrExtractionInput): Promise<OcrExtraction>;
}
