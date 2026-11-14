export const PLATFORM_CONTRACT_VERSION = 1 as const;

export const CAPABILITY_ERROR_CODES = [
  "unsupported_capability",
  "permission_denied",
  "camera_unavailable",
  "cancelled",
  "auth_required",
  "model_missing",
  "invalid_input",
  "provider_unavailable",
  "quota_exceeded",
  "internal_error"
] as const;

export type CapabilityErrorCode = (typeof CAPABILITY_ERROR_CODES)[number];

export interface CapabilityError {
  readonly code: CapabilityErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export const CAPTURE_SOURCES = ["camera", "gallery", "file", "screenshot"] as const;
export type CaptureSource = (typeof CAPTURE_SOURCES)[number];

export interface CaptureRef {
  readonly captureId: string;
  readonly source: CaptureSource;
  readonly fileName: string;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly sizeBytes: number;
}

export const CAMERA_FACING = ["back", "front"] as const;
export type CameraFacing = (typeof CAMERA_FACING)[number];

export const CAMERA_FLASH_MODES = ["auto", "on", "off"] as const;
export type CameraFlashMode = (typeof CAMERA_FLASH_MODES)[number];

export const OCR_DEFAULT_MAX_DIMENSION = 2048 as const;
export const OCR_MAX_BYTES = 10 * 1024 * 1024;
export const OCR_MAX_DIMENSION = 4096 as const;

export interface CameraOptions {
  readonly facing: CameraFacing;
  readonly flash: CameraFlashMode;
  readonly maxDimension: number;
}

export const DEFAULT_CAMERA_OPTIONS: CameraOptions = Object.freeze({
  facing: "back",
  flash: "auto",
  maxDimension: OCR_DEFAULT_MAX_DIMENSION
});

export interface CameraCaptured {
  readonly status: "captured";
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: "image/jpeg";
  readonly sizeBytes: number;
}

export interface CameraCancelled {
  readonly status: "cancelled";
}

export interface CameraFailed {
  readonly status: "failed";
  readonly error: CapabilityError;
}

export type CameraResult = CameraCaptured | CameraCancelled | CameraFailed;

export const OCR_ENGINES = ["rusto"] as const;
export type OcrEngine = (typeof OCR_ENGINES)[number];

export interface OcrBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface OcrLine {
  readonly text: string;
  readonly confidence: number;
  readonly box: OcrBox | null;
}

export interface OcrPage {
  readonly pageNumber: number;
  readonly width: number;
  readonly height: number;
  readonly text: string;
  readonly meanConfidence: number;
  readonly lines: readonly OcrLine[];
}

export interface OcrResult {
  readonly engine: OcrEngine;
  readonly engineVersion: string;
  readonly modelVersion: string;
  readonly pages: readonly OcrPage[];
  readonly meanConfidence: number;
  readonly fallbackRecommended: boolean;
  readonly warnings: readonly string[];
  readonly durationMs: number;
}

export interface HostCapabilities {
  readonly nativeAgent: boolean;
  readonly localOcr: boolean;
  readonly screenshotCapture: boolean;
  readonly cameraPreview: boolean;
  readonly browserAssistance: boolean;
  readonly mobileSafeToolsOnly: boolean;
}

export interface ServerCapabilities {
  readonly webSearch: boolean;
  readonly webFetch: boolean;
  readonly cloudOcr: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasBooleanKeys = <T extends string>(
  value: Record<string, unknown>,
  keys: readonly T[]
): boolean => keys.every((key) => typeof value[key] === "boolean");

export function isCapabilityError(value: unknown): value is CapabilityError {
  if (!isRecord(value)) return false;
  const code = value["code"];
  return (
    CAPABILITY_ERROR_CODES.some((candidate) => candidate === code) &&
    typeof value["message"] === "string" &&
    typeof value["retryable"] === "boolean"
  );
}

export function isHostCapabilities(value: unknown): value is HostCapabilities {
  if (!isRecord(value)) return false;
  return hasBooleanKeys(value, [
    "nativeAgent",
    "localOcr",
    "screenshotCapture",
    "cameraPreview",
    "browserAssistance",
    "mobileSafeToolsOnly"
  ] satisfies readonly (keyof HostCapabilities)[]);
}

export function isServerCapabilities(value: unknown): value is ServerCapabilities {
  if (!isRecord(value)) return false;
  return hasBooleanKeys(value, [
    "webSearch",
    "webFetch",
    "cloudOcr"
  ] satisfies readonly (keyof ServerCapabilities)[]);
}

export function isCameraResult(value: unknown): value is CameraResult {
  if (!isRecord(value)) return false;
  const status = value["status"];
  if (status === "cancelled") return true;
  if (status === "captured") {
    return (
      typeof value["path"] === "string" &&
      typeof value["width"] === "number" &&
      typeof value["height"] === "number" &&
      value["mimeType"] === "image/jpeg" &&
      typeof value["sizeBytes"] === "number"
    );
  }
  if (status === "failed") return isCapabilityError(value["error"]);
  return false;
}
