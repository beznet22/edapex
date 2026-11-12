import type { HostCapabilities, ServerCapabilities } from "@edapex/contracts/platform";

import { getHostCapabilities } from "@/lib/tauri";
import { isTauriHost } from "@/lib/platform";

export const BROWSER_HOST_CAPABILITIES: HostCapabilities = Object.freeze({
  nativeAgent: false,
  localOcr: false,
  screenshotCapture: false,
  cameraPreview: false,
  browserAssistance: false,
  mobileSafeToolsOnly: false
});

export const NO_SERVER_CAPABILITIES: ServerCapabilities = Object.freeze({
  webSearch: false,
  webFetch: false,
  cloudOcr: false
});

export async function loadHostCapabilities(): Promise<HostCapabilities> {
  if (!isTauriHost()) return BROWSER_HOST_CAPABILITIES;
  return getHostCapabilities();
}
