import { useEffect, useState } from "react";

import { AppDrawer } from "@/components/app/AppDrawer";
import { ChatSurface } from "@/components/app/ChatSurface";
import { ListSurface } from "@/components/app/ListSurface";
import { MakeSurface } from "@/components/app/MakeSurface";
import { SettingsSurface } from "@/components/app/SettingsSurface";
import { BootVeil } from "@/components/shell/BootVeil";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { onSystemBack, setBackEnabled } from "@/lib/host-bridge";
import { SECTIONS, type SurfaceId } from "@/lib/nav";
import { applyThemeMode, readThemeMode, watchSystemTheme } from "@/lib/theme";

type View = "chat" | "make" | Exclude<SurfaceId, "chat" | "make">;

/**
 * The shell from the four frames.
 *
 * There is no dock and no app bar. The top strip carries the two things you begin from —
 * Chat and Make — and everything else is in the drawer. Navigation is therefore one
 * component with one open state, which is also what makes the back gesture unambiguous:
 * back closes the attach panel, then the drawer, then returns to Chat, and only then leaves.
 *
 * The drawer's destinations render seeded lists until Part IV gives each its own surface.
 */
export function App() {
  const keyboardOpen = useKeyboardOpen();
  const [view, setView] = useState<View>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyThemeMode(readThemeMode());
    return watchSystemTheme(readThemeMode);
  }, []);

  useEffect(() => {
    // The veil hands over from the native splash; one frame means it is painted before it fades.
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    // Frame 4 has no scrim: touching the conversation behind the panel dismisses it.
    if (!attachOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest("[data-attach-panel]") === null) {
        setAttachOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [attachOpen]);

  const canConsumeBack = attachOpen || drawerOpen || view !== "chat";
  useEffect(() => {
    setBackEnabled(canConsumeBack);
    return onSystemBack(() => {
      if (attachOpen) {
        setAttachOpen(false);
        return;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      setView("chat");
    });
  }, [attachOpen, canConsumeBack, drawerOpen]);

  const go = (id: SurfaceId | "new") => {
    setDrawerOpen(false);
    setAttachOpen(false);
    setView(id === "new" ? "chat" : id);
  };

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {view === "chat" ? (
        <ChatSurface
          approvals={3}
          attachOpen={attachOpen}
          busy={false}
          keyboardOpen={keyboardOpen}
          mode="chat"
          onAttach={() => setAttachOpen((open) => !open)}
          onAttachSelect={() => setAttachOpen(false)}
          onModeChange={setView}
          onOpenDrawer={() => setDrawerOpen(true)}
          onQuickAction={(id) => {
            if (id === "scan") setAttachOpen(true);
            else setView("make");
          }}
          onSelect={go}
          onSend={() => undefined}
        />
      ) : null}

      {view === "make" ? (
        <MakeSurface
          approvals={3}
          onDraft={() => undefined}
          onModeChange={setView}
          onOpenDrawer={() => setDrawerOpen(true)}
          onSelect={go}
        />
      ) : null}

      {view === "settings" ? <SettingsSurface onBack={() => setView("chat")} /> : null}

      {view !== "chat" && view !== "make" && view !== "settings" ? (
        <ListSurface onBack={() => setView("chat")} section={SECTIONS[view]} surface={view} />
      ) : null}

      <AppDrawer
        onClose={() => setDrawerOpen(false)}
        onSelect={go}
        open={drawerOpen}
        selected={view}
      />

      <BootVeil ready={ready} />
    </div>
  );
}
