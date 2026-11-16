import { useEffect, useState } from "react";
import { Menu, ScanLine, Sparkles } from "lucide-react";

import { Button } from "@edapex/ui/components/button";

import { Dock } from "@/components/shell/Dock";
import { ListRow } from "@/components/shell/ListRow";
import { PaperSurface } from "@/components/shell/PaperSurface";
import { Rail } from "@/components/shell/Rail";
import { Screen } from "@/components/shell/Screen";
import { ScreenHeader } from "@/components/shell/ScreenHeader";
import { Sheet } from "@/components/shell/Sheet";
import { BrandMarkReveal } from "@/components/brand/BrandMarkReveal";
import { BootVeil } from "@/components/shell/BootVeil";
import { TouchTarget } from "@/components/shell/TouchTarget";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { useScrollCollapse } from "@/hooks/use-scroll-collapse";
import { useWindowClass, usesRail } from "@/hooks/use-window-class";
import { onSystemBack, setBackEnabled } from "@/lib/host-bridge";
import { DESTINATIONS, type DestinationId } from "@/lib/nav";
import { applyThemeMode, readThemeMode, watchSystemTheme } from "@/lib/theme";

const TITLES: Readonly<Record<DestinationId, string>> = {
  chat: "Chat",
  scan: "Scan",
  tasks: "Tasks",
  account: "Account"
};

const MOTION_PRESETS = [
  "motion-spatial-fast",
  "motion-spatial-default",
  "motion-spatial-slow",
  "motion-spatial-play",
  "motion-effects-fast",
  "motion-effects-default",
  "motion-effects-slow"
] as const;

/**
 * The B1 shell and its kitchen sink.
 *
 * The shell is real: window-class navigation, a collapsing header, the dock hiding for the
 * keyboard, insets written once in `Screen`. The panels below it are the kit's own proof —
 * every surface the later commits compose from, rendered at a size where a regression is
 * visible. They are replaced by the actual surfaces in Part IV.
 */
export function App() {
  const windowClass = useWindowClass();
  const withRail = usesRail(windowClass);
  const keyboardOpen = useKeyboardOpen();
  const { ref, collapsed } = useScrollCollapse();

  const [destination, setDestination] = useState<DestinationId>("chat");
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [light, setLight] = useState(true);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const sheetOpen = menuOpen || previewOpen;

  useEffect(() => {
    applyThemeMode(readThemeMode());
    return watchSystemTheme(readThemeMode);
  }, []);

  useEffect(() => {
    // The veil hands over from the native splash. One frame means it is painted before it
    // starts fading, which is what makes two surfaces read as one.
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // The onboarding beat, demonstrated here until D1 mounts it for real.
    const timer = window.setTimeout(() => setRevealed(true), 200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Back closes a sheet before it exits the app. The host is told when the page can
    // consume the gesture; when it cannot, the host lets the system close the task.
    setBackEnabled(sheetOpen);
    return onSystemBack(() => {
      setMenuOpen(false);
      setPreviewOpen(false);
    });
  }, [sheetOpen]);

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {withRail ? <Rail approvals={3} current={destination} onSelect={setDestination} /> : null}

      <Screen className="min-w-0 flex-1">
        <div className="scrollbar-auto min-h-0 flex-1 overflow-y-auto" ref={ref}>
          <ScreenHeader
            action={
              <TouchTarget label="Open menu" onPress={() => setMenuOpen(true)}>
                <Menu aria-hidden="true" className="size-5" />
              </TouchTarget>
            }
            collapsed={collapsed}
            title={TITLES[destination]}
          />

          <div className="flex flex-col gap-4 px-gutter pb-32 pt-2">
            <PaperSurface>
              <p className="text-label text-muted-foreground">Paper surface</p>
              <p className="mt-1 text-body">
                The Android shell is up. Window class{" "}
                <span className="text-foreground">{windowClass}</span>, navigation in a{" "}
                {withRail ? "rail" : "dock"}.
              </p>
            </PaperSurface>

            <section aria-label="Rows" className="overflow-hidden rounded-lg border border-border">
              <ListRow description="A row grows with the text scale" label="Rows, not cards" />
              <ListRow
                control={
                  <Button
                    onClick={() => setLight((value) => !value)}
                    size="sm"
                    variant={light ? "default" : "outline"}
                  >
                    {light ? "On" : "Off"}
                  </Button>
                }
                description="Label left, control right, hairline between"
                label="Toggle inline"
              />
              <ListRow
                description="Two lines, description muted"
                label="Tap to open the sheet"
                onPress={() => setPreviewOpen(true)}
              />
            </section>

            <section aria-label="Targets" className="flex items-center gap-2">
              <TouchTarget label="Scan a document">
                <ScanLine aria-hidden="true" className="size-5" />
              </TouchTarget>
              <TouchTarget label="Send">
                <Sparkles aria-hidden="true" className="size-5" />
              </TouchTarget>
              <span className="text-label text-muted-foreground">
                44dp targets, 20dp icons
              </span>
            </section>

            <section aria-label="Brand mark" className="flex flex-col items-start gap-3">
              <p className="text-label text-muted-foreground">
                The onboarding reveal: the book opens from its spine
              </p>
              <BrandMarkReveal className="w-40" revealed={revealed} />
              <Button
                onClick={() => {
                  setRevealed(false);
                  // Two frames: one to paint the clipped state, one to start the transition.
                  requestAnimationFrame(() =>
                    requestAnimationFrame(() => setRevealed(true))
                  );
                }}
                size="sm"
                variant="outline"
              >
                Replay reveal
              </Button>
            </section>

            <section aria-label="Motion presets" className="flex flex-col gap-2">
              <p className="text-label text-muted-foreground">
                Motion presets, from the token sheet
              </p>
              {MOTION_PRESETS.map((preset) => (
                <div
                  className={`${preset} rounded-lg border border-border bg-card px-3 py-2 text-label text-muted-foreground`}
                  key={preset}
                >
                  {preset}
                </div>
              ))}
            </section>
          </div>
        </div>
      </Screen>

      {withRail ? null : (
        <Dock approvals={3} current={destination} hidden={keyboardOpen} onSelect={setDestination} />
      )}

      <Sheet onClose={() => setMenuOpen(false)} open={menuOpen} title="EdApex Work">
        <div className="overflow-hidden rounded-lg border border-border">
          {DESTINATIONS.map((destinationItem) => (
            <ListRow
              key={destinationItem.id}
              label={destinationItem.label}
              onPress={() => {
                setDestination(destinationItem.id);
                setMenuOpen(false);
              }}
            />
          ))}
        </div>
      </Sheet>

      <Sheet onClose={() => setPreviewOpen(false)} open={previewOpen} title="Sheet" variant="full">
        <p className="text-body">
          The full-height variant is the same component at one snap point. Drag it down or
          press back to dismiss.
        </p>
      </Sheet>

      <BootVeil ready={ready} />
    </div>
  );
}
