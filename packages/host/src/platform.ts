export function isTauriHost(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

export function isDesktopViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth >= 1024;
}

export function isDesktopTauriViewport(): boolean {
  return isTauriHost() && isDesktopViewport();
}
