import { env } from "$env/dynamic/private";
import { EXTRACTION_PROMPT } from "./scan-prompt";
import {
  findPositionalErrors,
  parseScanExtraction,
  SCAN_EXTRACTION_NAME,
  scanExtractionJsonSchema,
  type ScanExtraction,
} from "./scan-extraction-schema";
import type { ScanAttempt } from "./scan-types";

export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/v1/responses";
export const DEEPSEEK_MODEL = "deepseek-flash";
export const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

export const EXTRACT_TIMEOUT_MS = 45_000;
const RETRY_DELAYS_MS = [1_000, 2_000];

export type ScanProvider = "deepseek" | "gemini";

export interface ExtractionResult {
  extraction: ScanExtraction;
  provider: ScanProvider;
  model: string;
  attempt: ScanAttempt;
}

export class ScanExtractionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "PROVIDER_UNCONFIGURED"
      | "PROVIDER_TIMEOUT"
      | "PROVIDER_REJECTED"
      | "PROVIDER_ERROR"
      | "SCHEMA_REJECTED"
      | "EMPTY_RESPONSE"
      | "POSITIONAL_MISMATCH",
    readonly retryable: boolean
  ) {
    super(message);
    this.name = "ScanExtractionError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Responses API: `output[].content[].text`. Walks the shape without trusting it. */
const readDeepSeekText = (payload: unknown): string | null => {
  if (!isRecord(payload) || !Array.isArray(payload.output)) return null;
  const parts: string[] = [];
  for (const item of payload.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.length > 0 ? parts.join("") : null;
};

/** Gemini: `candidates[0].content.parts[].text`. */
const readGeminiText = (payload: unknown): string | null => {
  if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
  const [first] = payload.candidates;
  if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
    return null;
  }
  const parts = first.content.parts.filter(
    (part): part is { text: string } => isRecord(part) && typeof part.text === "string"
  );
  return parts.length > 0 ? parts.map((part) => part.text).join("") : null;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const callDeepSeek = async (input: {
  base64: string;
  staffId: number;
}): Promise<unknown> => {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new ScanExtractionError("DEEPSEEK_API_KEY is not configured", "PROVIDER_UNCONFIGURED", false);
  }

  const body = {
    model: DEEPSEEK_MODEL,
    user_id: `staff-${input.staffId}`,
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: EXTRACTION_PROMPT },
          { type: "input_image", image_url: `data:image/jpeg;base64,${input.base64}` },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: SCAN_EXTRACTION_NAME,
        schema: scanExtractionJsonSchema,
        strict: true,
      },
    },
    reasoning: { effort: "none" },
    max_output_tokens: 1500,
  };

  let lastError: ScanExtractionError | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1]);

    let response: Response;
    try {
      response = await fetch(DEEPSEEK_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
      });
    } catch (cause) {
      const timedOut = cause instanceof Error && cause.name === "TimeoutError";
      lastError = new ScanExtractionError(
        timedOut ? "DeepSeek timed out" : "DeepSeek request failed",
        timedOut ? "PROVIDER_TIMEOUT" : "PROVIDER_ERROR",
        true
      );
      continue;
    }

    if (response.ok) return response.json();

    const detail = await response.text().catch(() => "");
    const retryable = response.status === 429 || response.status >= 500;
    lastError = new ScanExtractionError(
      `DeepSeek returned ${response.status}: ${detail.slice(0, 300)}`,
      "PROVIDER_REJECTED",
      retryable
    );
    if (!retryable) throw lastError;
  }

  throw lastError ?? new ScanExtractionError("DeepSeek unavailable", "PROVIDER_ERROR", true);
};

const callGemini = async (input: { base64: string }): Promise<unknown> => {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ScanExtractionError("GEMINI_API_KEY is not configured", "PROVIDER_UNCONFIGURED", false);
  }

  const response = await fetch(
    `${GEMINI_ENDPOINT}/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: EXTRACTION_PROMPT },
              { inline_data: { mime_type: "image/jpeg", data: input.base64 } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: scanExtractionJsonSchema,
          thinkingConfig: { thinkingLevel: "MINIMAL" },
          maxOutputTokens: 1500,
        },
      }),
      signal: AbortSignal.timeout(EXTRACT_TIMEOUT_MS),
    }
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ScanExtractionError(
      `Gemini returned ${response.status}: ${detail.slice(0, 300)}`,
      "PROVIDER_REJECTED",
      response.status === 429 || response.status >= 500
    );
  }
  return response.json();
};

const interpret = (input: {
  text: string | null;
  provider: ScanProvider;
  model: string;
  durationMs: number;
}): ExtractionResult => {
  if (!input.text) {
    throw new ScanExtractionError("Provider returned no text", "EMPTY_RESPONSE", false);
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(input.text);
  } catch {
    throw new ScanExtractionError("Provider returned invalid JSON", "SCHEMA_REJECTED", false);
  }

  const extraction = parseScanExtraction(decoded);
  if (!extraction) {
    throw new ScanExtractionError("Provider output failed schema validation", "SCHEMA_REJECTED", false);
  }

  const positional = findPositionalErrors(extraction);
  if (positional.length > 0) {
    throw new ScanExtractionError(
      `Row/column mismatch: ${positional.join("; ")}`,
      "POSITIONAL_MISMATCH",
      false
    );
  }

  return {
    extraction,
    provider: input.provider,
    model: input.model,
    attempt: { durationMs: input.durationMs },
  };
};

/**
 * DeepSeek first, Gemini only when DeepSeek is unreachable or rate-limited. A schema rejection
 * is never retried against another provider — that would just spend money on a bad capture.
 */
export async function extractMarksheet(input: {
  bytes: Buffer;
  staffId: number;
}): Promise<ExtractionResult> {
  const base64 = input.bytes.toString("base64");

  const startedDeepSeek = Date.now();
  try {
    const payload = await callDeepSeek({ base64, staffId: input.staffId });
    return interpret({
      text: readDeepSeekText(payload),
      provider: "deepseek",
      model: DEEPSEEK_MODEL,
      durationMs: Date.now() - startedDeepSeek,
    });
  } catch (cause) {
    const error = cause instanceof ScanExtractionError ? cause : null;
    if (!error || !error.retryable) throw cause;

    const startedGemini = Date.now();
    const payload = await callGemini({ base64 });
    return interpret({
      text: readGeminiText(payload),
      provider: "gemini",
      model: GEMINI_MODEL,
      durationMs: Date.now() - startedGemini,
    });
  }
}

/** Compares two attempts cell by cell; used to surface disagreements instead of picking one. */
export const collectCellDiffs = (a: ScanExtraction, b: ScanExtraction): string[] => {
  const diffs: string[] = [];
  const rows = new Map(a.records.map((record) => [record.subjectCode, record.marks]));
  for (const record of b.records) {
    const left = rows.get(record.subjectCode);
    if (!left) {
      diffs.push(`${record.subjectCode}: missing in first attempt`);
      continue;
    }
    const width = Math.max(left.length, record.marks.length);
    for (let index = 0; index < width; index += 1) {
      if (left[index] !== record.marks[index]) {
        diffs.push(`${record.subjectCode}[${index}]: ${left[index] ?? "—"} vs ${record.marks[index] ?? "—"}`);
      }
    }
  }
  return diffs;
};

/** True when a first pass needs a second opinion (plan §5: one automatic re-extract). */
export const needsSecondPass = (input: {
  extraction: ScanExtraction;
  validationErrors: string[];
  validationWarnings: string[];
}): boolean =>
  input.validationErrors.length > 0 ||
  input.validationWarnings.length > 0 ||
  input.extraction.pageConfidence === "low";
