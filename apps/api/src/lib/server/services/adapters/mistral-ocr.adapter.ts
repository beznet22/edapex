import { PortError } from "../errors";
import type { OcrClient, OcrExtraction, OcrExtractionInput } from "../ports";

export interface MistralOcrOptions {
  readonly apiKey: string | undefined;
  readonly model?: string | undefined;
  readonly baseUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

interface UploadResponse {
  readonly id: string;
}

interface OcrPage {
  readonly markdown: string;
}

interface OcrResponse {
  readonly pages: readonly OcrPage[];
  readonly annotation: unknown;
  readonly pageCount: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseUpload = (value: unknown): UploadResponse => {
  if (!isRecord(value) || typeof value["id"] !== "string") {
    throw new PortError("ocr", "Provider did not return a file id", true);
  }
  return { id: value["id"] };
};

const parseAnnotation = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  if (value.trim().length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
  }
};

const parseOcr = (value: unknown): OcrResponse => {
  if (!isRecord(value)) {
    throw new PortError("ocr", "Provider returned a non-object response", true);
  }

  const pagesValue = value["pages"];
  const pages: OcrPage[] = Array.isArray(pagesValue)
    ? pagesValue.map((page) => ({
        markdown: isRecord(page) && typeof page["markdown"] === "string" ? page["markdown"] : ""
      }))
    : [];

  const usage = value["usage_info"];
  const usagePages =
    isRecord(usage) && typeof usage["pages_processed"] === "number"
      ? usage["pages_processed"]
      : pages.length;

  return {
    pages,
    annotation: parseAnnotation(value["document_annotation"]),
    pageCount: usagePages
  };
};

export class MistralOcrAdapter implements OcrClient {
  constructor(private readonly options: MistralOcrOptions) {}

  async extract(input: OcrExtractionInput): Promise<OcrExtraction> {
    const apiKey = this.options.apiKey;
    if (apiKey === undefined || apiKey.length === 0) {
      throw new PortError("ocr", "MISTRAL_API_KEY is not configured", false);
    }

    const baseUrl = (this.options.baseUrl ?? "https://api.mistral.ai").replace(/\/+$/, "");
    const model = this.options.model ?? "mistral-ocr-latest";
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const headers = { Authorization: `Bearer ${apiKey}` };

    let fileId: string | null = null;
    try {
      const form = new FormData();
      form.append("purpose", "ocr");
      form.append("file", input.file, input.fileName);

      const uploadResponse = await fetchImpl(`${baseUrl}/v1/files`, {
        method: "POST",
        headers,
        body: form
      });
      if (!uploadResponse.ok) {
        throw new PortError("ocr", `File upload failed with status ${uploadResponse.status}`, true);
      }
      const uploaded = parseUpload(await uploadResponse.json());
      fileId = uploaded.id;

      const ocrResponse = await fetchImpl(`${baseUrl}/v1/ocr`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          document: { type: "file", file_id: uploaded.id },
          document_annotation_format: input.annotationJsonSchema,
          document_annotation_prompt:
            "Extract only values printed on the page. Use null when a field is blank; never infer missing marks.",
          include_blocks: true,
          confidence_scores_granularity: "page",
          include_image_base64: false
        })
      });
      if (!ocrResponse.ok) {
        throw new PortError("ocr", `OCR failed with status ${ocrResponse.status}`, true);
      }

      const parsed = parseOcr(await ocrResponse.json());
      return {
        markdown: parsed.pages
          .map((page) => page.markdown)
          .filter((markdown) => markdown.length > 0)
          .join("\n\n"),
        annotation: parsed.annotation,
        pageCount: parsed.pageCount
      };
    } catch (error) {
      if (error instanceof PortError) throw error;
      throw new PortError("ocr", "OCR request failed", true, { cause: error });
    } finally {
      if (fileId !== null) {
        try {
          await fetchImpl(`${baseUrl}/v1/files/${encodeURIComponent(fileId)}`, {
            method: "DELETE",
            headers
          });
        } catch {
          // Provider cleanup is best-effort; the OCR result is already safe.
        }
      }
    }
  }
}
