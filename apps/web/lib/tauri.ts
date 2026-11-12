import type { JsonValue } from "@edapex/contracts/json";
import type {
  CameraOptions,
  CameraResult,
  CaptureRef,
  HostCapabilities,
  OcrResult
} from "@edapex/contracts/platform";

import { isTauriHost } from "@/lib/platform";

export interface CoreHealth {
  readonly core_version: string;
  readonly local_state_schema: number;
  readonly agent_connected: boolean;
}

export interface TenantHeaders {
  readonly academicId: number;
  readonly classId: number;
  readonly sectionId: number;
}

export interface AuthStartResult {
  readonly authorizeUrl: string;
}

export interface AuthStatus {
  readonly authenticated: boolean;
}

async function invokeCommand<T>(
  command: string,
  args?: Readonly<Record<string, unknown>>
): Promise<T> {
  if (!isTauriHost()) {
    throw new Error(`${command} is only available in the Tauri host.`);
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function getRuntimeHealth(): Promise<CoreHealth> {
  return invokeCommand<CoreHealth>("runtime_health");
}

export async function getHostCapabilities(): Promise<HostCapabilities> {
  return invokeCommand<HostCapabilities>("host_capabilities");
}

export async function captureScreen(region?: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}): Promise<CaptureRef> {
  return invokeCommand<CaptureRef>("capture_screen", { region });
}

export async function captureImport(
  file: File,
  source: "camera" | "gallery" | "file"
): Promise<CaptureRef> {
  const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
  return invokeCommand<CaptureRef>("capture_import", {
    bytes,
    fileName: file.name,
    source
  });
}

export async function captureImportPath(
  path: string,
  fileName: string,
  source: "camera"
): Promise<CaptureRef> {
  return invokeCommand<CaptureRef>("capture_import_path", {
    path,
    fileName,
    source
  });
}

export async function captureRelease(captureId: string): Promise<void> {
  await invokeCommand<void>("capture_release", { captureId });
}

export async function capturePreview(captureId: string): Promise<string> {
  return invokeCommand<string>("capture_preview", { captureId });
}

export async function ocrExtract(captureId: string): Promise<OcrResult> {
  return invokeCommand<OcrResult>("ocr_extract", { captureId });
}

export async function ocrMistral(
  captureId: string,
  tenant: TenantHeaders
): Promise<unknown> {
  return invokeCommand<unknown>("ocr_mistral", { captureId, tenant });
}

export async function openCamera(options: CameraOptions): Promise<CameraResult> {
  return invokeCommand<CameraResult>("plugin:camera|open", { options });
}

export async function authStart(): Promise<AuthStartResult> {
  return invokeCommand<AuthStartResult>("auth_start");
}

export async function authExchange(code: string): Promise<unknown> {
  return invokeCommand<unknown>("auth_exchange", { code });
}

export async function authStatus(): Promise<AuthStatus> {
  return invokeCommand<AuthStatus>("auth_status");
}

export async function authLogout(): Promise<void> {
  await invokeCommand<void>("auth_logout");
}

export async function apiRequest(
  method: string,
  path: string,
  body?: JsonValue,
  headers?: Readonly<Record<string, string>>
): Promise<unknown> {
  return invokeCommand<unknown>("api_request", { method, path, body, headers });
}
