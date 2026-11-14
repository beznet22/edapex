"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { ReactNode } from "react";

import {
  DEFAULT_THEME,
  parseTheme,
  type Accent,
  type ThemeMode,
  type ThemePreference
} from "@/lib/theme";
import { applyTheme, writeThemeCookies } from "@/lib/theme-dom";

interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly setMode: (mode: ThemeMode) => void;
  readonly setAccent: (accent: Accent) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Applies a theme preference and keeps it in sync with the OS.
 *
 * The server already put the right class on `<html>` from the cookie, so this
 * only reacts to user changes and to a system preference flip while the mode is
 * `system`.
 */
export function ThemeProvider({
  children,
  initial
}: {
  readonly children: ReactNode;
  readonly initial: ThemePreference;
}) {
  const [preference, setPreference] = useState<ThemePreference>(initial);

  const commit = useCallback((next: ThemePreference): void => {
    setPreference(next);
    applyTheme(next);
    writeThemeCookies(next);
  }, []);

  useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  useEffect(() => {
    if (preference.mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (): void => applyTheme(preference);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, [preference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      setMode: (mode) => commit({ ...preference, mode }),
      setAccent: (accent) => commit({ ...preference, accent })
    }),
    [commit, preference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (value === null) {
    // A component outside the provider still gets a working control rather than
    // a crash, because the toggle lives in the shell header.
    return {
      preference: DEFAULT_THEME,
      setMode: () => undefined,
      setAccent: () => undefined
    };
  }
  return value;
}

export { parseTheme };
