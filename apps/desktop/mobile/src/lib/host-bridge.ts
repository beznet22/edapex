/**
 * The page's half of the native contract.
 *
 * `MainActivity` injects one JS interface with two setters. In a browser tab it is absent,
 * so every call here is a no-op — which is what lets the same bundle run in a desktop
 * WebView, on a phone, and in `vite dev`.
 *
 * The interface carries two booleans and one string. The string is the FCM registration
 * token and it is the exception worth naming: the page has to send it to `/v1/devices`, the
 * keychain-held session token never crosses this boundary, and a push token routes
 * notifications to one install rather than granting access to anything.
 */
interface EdApexHostBridge {
  /** Empty string until Firebase has issued one; never null across the bridge. */
  pushToken(): string;
  setBackEnabled(enabled: boolean): void;
  setDarkTheme(dark: boolean): void;
  bootReady(): void;
}

declare global {
  interface Window {
    EdApexHost?: EdApexHostBridge;
    __edapexBack?: () => void;
    __TAURI_INTERNALS__?: unknown;
  }
}

/** Tell the host whether the page can consume a back gesture right now. */
export function setBackEnabled(enabled: boolean): void {
  window.EdApexHost?.setBackEnabled(enabled);
}

/**
 * Keep the status-bar icon tint in step with the app's theme.
 *
 * `uiMode` is in `configChanges`, so the activity is never recreated on a theme change and
 * the platform would otherwise keep the icons it started with.
 */
export function setDarkTheme(dark: boolean): void {
  window.EdApexHost?.setDarkTheme(dark);
}

/**
 * Tell the host the first frame has been painted.
 *
 * The native splash holds until this arrives, so the hand-off happens between two surfaces
 * that are both already drawn rather than at a guess. The host also has a timeout: a bundle
 * that never loads must not leave the splash holding the screen forever.
 */
export function bootReady(): void {
  window.EdApexHost?.bootReady();
}

/**
 * Register what the hardware back gesture should do.
 *
 * The host calls this only when the page said it can consume the gesture, so the handler
 * always acts — returning `false` from here would leave the person stuck, because the
 * native side has already decided not to exit.
 */
export function onSystemBack(handler: () => void): () => void {
  window.__edapexBack = handler;
  return () => {
    delete window.__edapexBack;
  };
}

/** The FCM token for this install, or null when the host has not issued one yet. */
export function readPushToken(): string | null {
  const token = window.EdApexHost?.pushToken() ?? "";
  return token.length > 0 ? token : null;
}
