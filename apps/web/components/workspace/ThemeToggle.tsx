"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
          <Button
            aria-label={`${LABELS[mode]} theme`}
            aria-pressed={active}
            className={cn(
              // A segmented control: the surface belongs to the group, so a segment is
              // transparent at rest and only the active one lifts. `after:-inset-1.5`
              // grows the target to ~44px — three real 44px boxes would not fit beside
              // the runtime pill.
              "size-8 after:-inset-1.5",
              active
                ? "bg-card text-foreground shadow-sm hover:bg-card"
                : "text-muted-foreground hover:bg-transparent hover:text-foreground"
            )}
            key={mode}
            onClick={() => setMode(mode)}
            size="sm"
            title={`${LABELS[mode]} theme`}
            type="button"
            variant="ghost"
          >
            <Icon aria-hidden="true" className="size-3.5" />
          </Button>
        );
      })}
    </div>
  );
}
