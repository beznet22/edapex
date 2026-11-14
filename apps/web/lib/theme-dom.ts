/**
 * Browser-only theme helpers.
 *
 * Split from `theme.ts` because that module is imported by the server-rendered
 * root layout; these functions touch `document` and must never run on the server.
 * They carry no "use client" directive so importing them from a server component
 * fails loudly at the call site rather than silently producing a client reference.
 */
import { ACCENT_COOKIE, resolveDarkClass, THEME_COOKIE, type ThemePreference } from "./theme";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function writeThemeCookies(preference: ThemePreference): void {
  const maxAge = `; max-age=${ONE_YEAR}; path=/; samesite=lax`;
  document.cookie = `${THEME_COOKIE}=${preference.mode}${maxAge}`;
  document.cookie = `${ACCENT_COOKIE}=${preference.accent}${maxAge}`;
}

/** Apply a preference to the document without a round trip. */
export function applyTheme(preference: ThemePreference): void {
  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.classList.toggle("dark", resolveDarkClass(preference.mode, prefersDark));
  root.dataset.accent = preference.accent;
  root.dataset.themeMode = preference.mode;
}
