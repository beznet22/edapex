import { z } from "zod";
import type { Marksheet } from "$lib/schema/marksheet";

export const SCAN_STATUSES = [
  "queued",
  "extracting",
  "draft",
  "committed",
  "published",
  "failed",
] as const;

export type ScanStatusKey = (typeof SCAN_STATUSES)[number];

export type ScanUiStatus = "not_uploaded" | ScanStatusKey;

export const SCAN_UI_LABELS: Record<ScanUiStatus, string> = {
  not_uploaded: "Not Uploaded",
  queued: "Queued",
  extracting: "Extracting…",
  draft: "Draft",
  committed: "Uploaded",
  published: "Published",
  failed: "Error",
};

export const ENVELOPE_VERSION = 1;

export const STALE_QUEUED_MS = 10 * 60 * 1000;

export interface ScanDocumentRef {
  path: string;
  bytes: number;
  width: number;
  height: number;
}

export interface ScanValidation {
  errors: string[];
  warnings: string[];
  lowConfidence: string[];
}

export interface ScanAttempt {
  durationMs: number;
}

export interface ScanExtractionMeta {
  provider: "deepseek" | "gemini";
  model: string;
  reasoning: "none";
  attempts: ScanAttempt[];
}

export interface ScanFailure {
  message: string;
  code: string;
  at: string;
}

export interface ScanEnvelope {
  v: typeof ENVELOPE_VERSION;
  status: ScanStatusKey;
  captureId: string;
  capturedAt: string;
  queuedAt: string;
  updatedAt: string;
  document: ScanDocumentRef | null;
  marksheet: Marksheet | null;
  validation: ScanValidation;
  extraction: ScanExtractionMeta | null;
  failure: ScanFailure | null;
}

const documentSchema = z.object({
  path: z.string().min(1),
  bytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const validationSchema = z.object({
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  lowConfidence: z.array(z.string()),
});

const attemptSchema = z.object({
  durationMs: z.number().nonnegative(),
});

const extractionSchema = z.object({
  provider: z.enum(["deepseek", "gemini"]),
  model: z.string().min(1),
  reasoning: z.literal("none"),
  attempts: z.array(attemptSchema),
});

const failureSchema = z.object({
  message: z.string().min(1),
  code: z.string().min(1),
  at: z.string().min(1),
});

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const envelopeSchema = z.object({
  v: z.literal(ENVELOPE_VERSION),
  status: z.enum(SCAN_STATUSES),
  captureId: z.string().min(1),
  capturedAt: z.string().min(1),
  queuedAt: z.string().min(1),
  updatedAt: z.string().min(1),
  document: documentSchema.nullable(),
  marksheet: z.custom<Marksheet>(isPlainObject).nullable(),
  validation: validationSchema,
  extraction: extractionSchema.nullable(),
  failure: failureSchema.nullable(),
});

export const emptyValidation = (): ScanValidation => ({
  errors: [],
  warnings: [],
  lowConfidence: [],
});

export const createEnvelope = (input: {
  captureId: string;
  document: ScanDocumentRef;
  now?: Date;
}): ScanEnvelope => {
  const at = (input.now ?? new Date()).toISOString();
  return {
    v: ENVELOPE_VERSION,
    status: "queued",
    captureId: input.captureId,
    capturedAt: at,
    queuedAt: at,
    updatedAt: at,
    document: input.document,
    marksheet: null,
    validation: emptyValidation(),
    extraction: null,
    failure: null,
  };
};

export const serializeEnvelope = (envelope: ScanEnvelope): string => JSON.stringify(envelope);

export const parseEnvelope = (raw: string | null | undefined): ScanEnvelope | null => {
  if (!raw) return null;
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = envelopeSchema.safeParse(decoded);
  return result.success ? result.data : null;
};

export const advanceEnvelope = (
  envelope: ScanEnvelope,
  patch: Partial<Omit<ScanEnvelope, "v" | "captureId">>,
  now?: Date
): ScanEnvelope => ({
  ...envelope,
  ...patch,
  v: ENVELOPE_VERSION,
  captureId: envelope.captureId,
  updatedAt: (now ?? new Date()).toISOString(),
  failure: patch.status && patch.status !== "failed" ? null : (patch.failure ?? envelope.failure),
});

export const isStaleQueued = (
  envelope: ScanEnvelope,
  options: { now?: Date; maxAgeMs?: number } = {}
): boolean => {
  if (envelope.status !== "queued") return false;
  const queuedAt = Date.parse(envelope.queuedAt);
  if (Number.isNaN(queuedAt)) return true;
  const now = (options.now ?? new Date()).getTime();
  return now - queuedAt > (options.maxAgeMs ?? STALE_QUEUED_MS);
};

export const isFailureStatus = (status: ScanUiStatus): boolean => status === "failed";

export const isBusyStatus = (status: ScanUiStatus): boolean =>
  status === "queued" || status === "extracting";
