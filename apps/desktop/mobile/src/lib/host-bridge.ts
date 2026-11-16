/**
 * The page's half of the native contract.
 *
 * `MainActivity` injects one JS interface with two setters. In a browser tab it is absent,
 * so every call here is a no-op — which is what lets the same bundle run in a desktop
 * WebView, on a phone, and in `vite dev`.
 *
 * The interface deliberately has no getters and no data: it carries two booleans, so a
 * compromised page cannot read a token, a path or a resource through it.
 */
interface EdApexHostBridge {
  setBackEnabled(enabled: boolean): void;
  setDarkTheme(dark: boolean): void;
}

declare global {
  interface Window {
    EdApexHost?: EdApexHostBridge;
    __edapexBack?: () => void;
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
