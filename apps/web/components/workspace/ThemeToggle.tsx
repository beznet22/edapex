"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import { useTheme } from "@/components/workspace/ThemeProvider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";

const ICONS: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor
};

const LABELS: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System"
};

/**
 * Theme, as a labelled row in the sidebar footer.
 *
 * **Labelled, not icon-only.** A cycling control shows the *current* mode, so the icon
 * alone is ambiguous: a moon could mean "dark is on" or "switch to dark". The label
 * removes the guess, and the secondary line states what a click does next.
 *
 * It lives in the footer rather than the header because it is a preference, not state —
 * set roughly once, and it was one of six items crowding a 64px bar.
 */
export function ThemeToggle() {
  const { preference, setMode } = useTheme();

  const index = THEME_MODES.indexOf(preference.mode);
  const following = THEME_MODES[(index + 1) % THEME_MODES.length] ?? "system";
  const Icon = ICONS[preference.mode];

  return (
    <SidebarMenuButton
      // The accessible name carries both facts, because the visible second line is the
      // only place the *next* mode is stated.
      aria-label={`Theme: ${LABELS[preference.mode]}. Change to ${LABELS[following]}.`}
      data-theme-mode={preference.mode}
      onClick={() => setMode(following)}
      tooltip={`Theme: ${LABELS[preference.mode]}`}
      type="button"
    >
      <Icon aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left text-sm">
        <span className="font-medium">Theme</span>
        <span aria-hidden="true" className="mx-1.5 text-muted-foreground">
          |
        </span>
        <span className="text-muted-foreground">{LABELS[preference.mode]}</span>
      </span>
    </SidebarMenuButton>
  );
}
