"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useTheme } from "@/components/workspace/ThemeProvider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";
import { cn } from "@/lib/utils";

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
 * A three-way theme control.
 *
 * A single cycling button instead of a menu: there are only three states, and a
 * menu would cost a focus trap and a click for something a tap already resolves.
 */
export function ThemeToggle({ className }: { readonly className?: string }) {
  const { preference, setMode } = useTheme();

  return (
    <div
      aria-label="Colour theme"
      className={cn(
        "flex items-center gap-0.5 rounded-xl bg-muted/60 p-0.5",
        className
      )}
      role="group"
    >
      {THEME_MODES.map((mode) => {
        const Icon = ICONS[mode];
        const active = preference.mode === mode;
        return (
          <button
            aria-label={`${LABELS[mode]} theme`}
            aria-pressed={active}
            className={cn(
              "flex size-8 items-center justify-center rounded-lg transition-colors",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={mode}
            onClick={() => setMode(mode)}
            title={`${LABELS[mode]} theme`}
            type="button"
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </button>
        );
      })}
    </div>
  );
}
