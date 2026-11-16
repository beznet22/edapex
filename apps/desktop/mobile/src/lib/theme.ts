import { setDarkTheme } from "@/lib/host-bridge";

/**
 * Theme mode, resolved in the DOM and mirrored to the host.
 *
 * The token sheet already resolves `system` in CSS (`[data-theme-mode="system"]` inside a
 * `prefers-color-scheme` query), so the class is only needed for an explicit choice. The
 * host still has to be told, because status-bar icons are drawn by the platform and it
 * cannot see a CSS media query.
 */
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "edapex.theme";

export function readThemeMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // A WebView with storage disabled falls back to following the OS.
  }
  return "system";
}

export function writeThemeMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Not fatal: the choice just does not survive a restart.
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.themeMode = mode;

  const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
  root.classList.toggle("dark", dark);
  setDarkTheme(dark);
}

/** Re-apply when the OS flips, but only while the app is following the OS. */
export function watchSystemTheme(read: () => ThemeMode): () => void {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  const update = (): void => {
    if (read() === "system") applyThemeMode("system");
  };
  query.addEventListener("change", update);
  return () => query.removeEventListener("change", update);
}
