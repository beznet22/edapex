/**
 * Theme preferences, persisted in a cookie.
 *
 * A cookie rather than localStorage because the theme class has to be on the
 * server-rendered `<html>`. Reading localStorage in an inline script works but
 * flashes, and flashing a dark UI to light (or the reverse) on every reload is
 * exactly what the design spec forbids.
 *
 * Deliberately NOT marked "use client": the root layout is a server component and
 * calls `readThemeCookies` during render. A client directive turns every export
 * into a client reference, and calling one from the server throws at render time
 * (which no build step catches). Anything that touches `document` lives in
 * `theme-dom.ts` instead.
 */

export const THEME_COOKIE = "edapex.theme";
export const ACCENT_COOKIE = "edapex.accent";

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const ACCENTS = ["gold", "jade", "indigo"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface ThemePreference {
  readonly mode: ThemeMode;
  readonly accent: Accent;
}

export const DEFAULT_THEME: ThemePreference = { mode: "system", accent: "gold" };

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export function isAccent(value: unknown): value is Accent {
  return typeof value === "string" && (ACCENTS as readonly string[]).includes(value);
}

/**
 * Parse the cookie pair into a preference. Unknown values fall back to the
 * default rather than throwing: a stale cookie must not break the shell.
 */
export function parseTheme(mode: unknown, accent: unknown): ThemePreference {
  return {
    mode: isThemeMode(mode) ? mode : DEFAULT_THEME.mode,
    accent: isAccent(accent) ? accent : DEFAULT_THEME.accent
  };
}

/** The class the `<html>` element should carry for this preference. */
export function resolveDarkClass(mode: ThemeMode, prefersDark: boolean): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return prefersDark;
}

export function readThemeCookies(cookieHeader: string | null | undefined): ThemePreference {
  if (!cookieHeader) return DEFAULT_THEME;
  const pairs = new Map<string, string>();
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    pairs.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim()));
  }
  return parseTheme(pairs.get(THEME_COOKIE), pairs.get(ACCENT_COOKIE));
}
