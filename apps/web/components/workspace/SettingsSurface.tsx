"use client";

import { useTheme } from "@/components/workspace/ThemeProvider";
import { THEME_MODES, type ThemeMode } from "@/lib/theme";
import { ACCENTS, type Accent } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Settings — a row-based page, per `specs/51-settings-surface.md`.
 *
 * Rows are hairline-separated rather than individually carded: ten bordered cards in a
 * column is a stack of boxes, while hairlines read as one table. The label column is
 * left-aligned in a `max-w-[720px]` measure, not centred — a centred settings page makes
 * the eye travel to find the labels.
 */

const MODE_LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System"
};

const ACCENT_LABEL: Record<Accent, string> = {
  coral: "Coral",
  gold: "Gold",
  teal: "Teal",
  jade: "Jade",
  indigo: "Indigo"
};

export function SettingsSurface() {
  const { preference, setMode, setAccent } = useTheme();

  return (
    <section className="scrollbar-auto flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/*
        Centred at a 700px measure, matching the reference. Left-aligning it at the inset
        edge made the label column start 400px left of where the eye expects it after the
        sidebar.
      */}
      <div className="mx-auto w-full max-w-[700px] px-4 pb-12 pt-6 lg:px-8 lg:pt-8">
        <header>
          <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Appearance</h1>
          <p className="mt-1.5 text-[13px] leading-6 text-muted-foreground">
            Choose the colours you see in the app. This applies to this browser and follows you
            onto the desktop and mobile apps.
          </p>
        </header>

        <h2 className="mt-8 text-[13px] font-semibold">Visual style</h2>

        {/*
          Colour mode is a row like the others, not a full-width block. In the reference
          every setting shares one shape — label and description left, control right,
          hairline between — and breaking that for the first row made it read as a
          different kind of object.
        */}
        <Row
          control={
            <div aria-label="Colour mode" className="flex gap-2" role="radiogroup">
              {THEME_MODES.map((mode) => (
                <button
                  aria-checked={preference.mode === mode}
                  aria-label={MODE_LABEL[mode]}
                  className={cn(
                    "relative overflow-hidden rounded-[var(--radius-sm)] border-2 p-0.5 outline-none transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    preference.mode === mode
                      ? "border-ring"
                      : "border-transparent hover:border-border"
                  )}
                  key={mode}
                  onClick={() => setMode(mode)}
                  role="radio"
                  title={MODE_LABEL[mode]}
                  type="button"
                >
                  <ModePreview mode={mode} selected={preference.mode === mode} />
                </button>
              ))}
            </div>
          }
          description="Use light or dark colours, or follow your system setting."
          label="Colour mode"
        />

        <Row
          control={
            <select
              aria-label="Accent colour"
              className="h-9 rounded-[var(--radius-md)] border border-border bg-background px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onChange={(event) => setAccent(event.target.value as Accent)}
              value={preference.accent}
            >
              {ACCENTS.map((accent) => (
                <option key={accent} value={accent}>
                  {ACCENT_LABEL[accent]}
                </option>
              ))}
            </select>
          }
          description="The colour for highlights, selected controls and the active destination."
          label="Accent"
        />

        {/*
          A disclosure rather than a route. The reference keeps genuinely advanced
          controls (fonts, custom tokens) behind one flap so the page reads as four
          settings, not forty.
        */}
        <details className="mt-10 border-t border-border pt-4">
          <summary className="cursor-pointer text-[13px] font-medium text-muted-foreground hover:text-foreground">
            Advanced
          </summary>
          <div className="mt-3 space-y-3">
            <p className="text-[13px] leading-6 text-muted-foreground">
              EDAPEX uses one palette across the browser tab, the desktop window and the
              mobile app. Custom colours are not available yet — a per-device palette would
              make a screenshot impossible to reproduce on another machine.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}

/**
 * A miniature app.
 *
 * Six abstract lines on a rounded rectangle. It reads as "a window" at 88×56 without
 * pretending to be a screenshot, and it is drawn with the live tokens so switching the
 * accent is visible in the preview before it is committed.
 */
function ModePreview({
  mode,
  selected
}: {
  readonly mode: ThemeMode;
  readonly selected: boolean;
}) {
  // `system` renders both halves so the preview states what it actually does.
  if (mode === "system") {
    return (
      <span className="flex h-14 w-[88px] overflow-hidden rounded-[var(--radius-sm)] border border-border">
        <span className="flex w-1/2 flex-col gap-1 bg-[oklch(0.982_0.0054_95.1)] p-1.5">
          <Bar className="bg-[oklch(0.191_0.002_106.6_/_0.25)]" w="w-2/3" />
          <Bar className="bg-[oklch(0.191_0.002_106.6_/_0.15)]" w="w-full" />
          <Bar className="bg-[oklch(0.191_0.002_106.6_/_0.15)]" w="w-4/5" />
        </span>
        <span className="flex w-1/2 flex-col gap-1 bg-[oklch(0.205_0.0042_84.6)] p-1.5">
          <Bar className="bg-white/25" w="w-2/3" />
          <Bar className="bg-white/15" w="w-full" />
          <Bar className="bg-white/15" w="w-4/5" />
        </span>
      </span>
    );
  }

  const dark = mode === "dark";
  return (
    <span
      className="flex h-14 w-[88px] flex-col gap-1 rounded-[var(--radius-sm)] p-1.5"
      style={{
        backgroundColor: dark
          ? "oklch(0.205 0.0042 84.6)"
          : "oklch(0.982 0.0054 95.1)",
        border: "1px solid var(--border)"
      }}
    >
      <Bar className={dark ? "bg-white/25" : "bg-[oklch(0.191_0.002_106.6_/_0.25)]"} w="w-2/3" />
      <Bar className={dark ? "bg-white/15" : "bg-[oklch(0.191_0.002_106.6_/_0.15)]"} w="w-full" />
      <Bar className={dark ? "bg-white/15" : "bg-[oklch(0.191_0.002_106.6_/_0.15)]"} w="w-4/5" />
      {selected ? (
        <span
          aria-hidden="true"
          className="mt-auto h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--primary)" }}
        />
      ) : null}
    </span>
  );
}

function Bar({ className, w }: { readonly className: string; readonly w: string }) {
  return <span className={cn("block h-1 rounded-full", w, className)} />;
}

/** One settings row. Hairline above, control right-aligned to the label. */
function Row({
  label,
  description,
  control
}: {
  readonly label: string;
  readonly description: string;
  readonly control: React.ReactNode;
}) {
  return (
    <div className="mt-6 flex items-start justify-between gap-6 border-t border-border pt-4">
      <div className="min-w-0">
        <p className="text-[14px] font-medium leading-6">{label}</p>
        <p className="mt-0.5 max-w-[52ch] text-[13px] leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}
