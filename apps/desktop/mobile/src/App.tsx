import { useEffect, useReducer, useState } from "react";

import { AppDrawer } from "@/components/app/AppDrawer";
import { Onboarding } from "@/components/app/Onboarding";
import { SignIn } from "@/components/app/SignIn";
import { ChatSurface } from "@/components/app/ChatSurface";
import { ListSurface } from "@/components/app/ListSurface";
import { MakeSheet } from "@/components/app/MakeSheet";
import { SettingsSurface } from "@/components/app/SettingsSurface";
import { TasksSheet } from "@/components/app/TasksSheet";
import type { ComposeMode } from "@/components/app/TopBar";
import { BootVeil } from "@/components/shell/BootVeil";
import { Sheet } from "@/components/shell/Sheet";
import { useKeyboardOpen } from "@/hooks/use-keyboard-open";
import { usePushRegistration } from "@/hooks/use-push-registration";
import { bootReady, onSystemBack, setBackEnabled } from "@/lib/host-bridge";
import { exchangeCode, isAuthenticated, isHostFailure, startSignIn, watchAuthLinks } from "@/lib/auth";
import {
  type BootState,
  bootReducer,
  canGoBack,
  markOnboardingComplete,
  readOnboardingComplete
} from "@/lib/boot";
import { SECTIONS, type SurfaceId } from "@/lib/nav";
import { applyThemeMode, readThemeMode, watchSystemTheme } from "@/lib/theme";

type View = "chat" | Exclude<SurfaceId, "chat" | "make" | "tasks">;

/**
 * The shell from the four reference frames.
 *
 * Three layers, and the order matters. The segmented control switches what the screen is
 * showing — Chat, or the Tasks sheet over it. Make is not a tab: it is an action, so it
 * arrives from the menu or the drawer as a sheet. Pages — Settings and the drawer's other
 * destinations — replace the screen entirely.
 *
 * Back unwinds in that order: the attach panel, then an open sheet, then the drawer, then
 * the page, and only then the app.
 */
export function Shell() {
  const keyboardOpen = useKeyboardOpen();
  usePushRegistration();
  const [mode, setMode] = useState<ComposeMode>("chat");
  const [view, setView] = useState<View>("chat");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [makeOpen, setMakeOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    applyThemeMode(readThemeMode());
    return watchSystemTheme(readThemeMode);
  }, []);

  useEffect(() => {
    /*
     * Two frames, in this order: the first paints the veil, the second commits it. Only then
     * is the native splash allowed to leave, so the hand-off never exposes an unpainted
     * WebView — which is what the white flash was.
     */
    let second = 0;
    const first = requestAnimationFrame(() => {
      bootReady();
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
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

  const tasksOpen = mode === "tasks";
  const canConsumeBack =
    attachOpen || makeOpen || tasksOpen || drawerOpen || view !== "chat";

  useEffect(() => {
    setBackEnabled(canConsumeBack);
    return onSystemBack(() => {
      if (attachOpen) {
        setAttachOpen(false);
        return;
      }
      if (makeOpen) {
        setMakeOpen(false);
        return;
      }
      if (tasksOpen) {
        setMode("chat");
        return;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        return;
      }
      setView("chat");
    });
  }, [attachOpen, canConsumeBack, drawerOpen, makeOpen, tasksOpen]);

  const go = (id: SurfaceId | "new") => {
    setDrawerOpen(false);
    setAttachOpen(false);
    if (id === "new") {
      setMode("chat");
      setView("chat");
      return;
    }
    if (id === "make") {
      setMakeOpen(true);
      return;
    }
    if (id === "tasks") {
      setMode("tasks");
      return;
    }
    if (id === "chat") {
      setMode("chat");
      setView("chat");
      return;
    }
    setView(id as View);
  };

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {view === "chat" ? (
        <ChatSurface
          approvals={3}
          attachOpen={attachOpen}
          busy={false}
          keyboardOpen={keyboardOpen}
          mode={mode}
          onAttach={() => setAttachOpen((open) => !open)}
          onAttachSelect={() => setAttachOpen(false)}
          onModeChange={setMode}
          onOpenDrawer={() => setDrawerOpen(true)}
          onQuickAction={(id) => {
            if (id === "scan") setAttachOpen(true);
            else setMakeOpen(true);
          }}
          onSelect={go}
        />
      ) : null}

      {view === "settings" ? <SettingsSurface onBack={() => setView("chat")} /> : null}

      {view !== "chat" && view !== "settings" ? (
        <ListSurface onBack={() => setView("chat")} section={SECTIONS[view]} surface={view} />
      ) : null}

      <AppDrawer
        onClose={() => setDrawerOpen(false)}
        onSelect={go}
        open={drawerOpen}
        selected={view}
      />

      <Sheet onClose={() => setMode("chat")} open={tasksOpen} title="Tasks">
        <TasksSheet
          onOpenApprovals={() => {
            setMode("chat");
            setView("approvals");
          }}
        />
      </Sheet>

      <Sheet onClose={() => setMakeOpen(false)} open={makeOpen} title="New agent" variant="full">
        <MakeSheet onDraft={() => setMakeOpen(false)} />
      </Sheet>

      <BootVeil ready={ready} />
    </div>
  );
}

/**
 * The first-run decision, and nothing else.
 *
 * Hydration asks the keychain whether a session exists, which is asynchronous by nature, so
 * the first paint is the veil. That is affordable now in a way it was not before: the veil
 * is already the surface the splash hands over to, and it is painted before the answer
 * arrives rather than replaced by it.
 */
export function App() {
  const [boot, dispatch] = useReducer(bootReducer, { status: "loading" } as BootState);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const authenticated = await isAuthenticated().catch(() => false);
      if (!cancelled) {
        dispatch({
          type: "hydrated",
          onboardingComplete: readOnboardingComplete(),
          authenticated
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (boot.status !== "signed_out" && boot.status !== "authenticating") return;
    let dispose: (() => void) | null = null;
    let cancelled = false;
    void watchAuthLinks((code) => {
      dispatch({ type: "auth_started" });
      void exchangeCode(code).then(
        () => dispatch({ type: "auth_succeeded" }),
        (error: unknown) => dispatch({ type: "auth_failed", message: failureMessage(error) })
      );
    })
      .then((un) => {
        if (cancelled) un();
        else dispose = un;
      })
      .catch(() => {
        // No deep-link capability in this host: the sign-in screen still works, the
        // callback simply cannot arrive until the app is rebuilt with it.
      });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [boot.status]);

  useEffect(() => {
    return onSystemBack(() => {
      if (canGoBack(boot)) dispatch({ type: "onboarding_back" });
    });
  }, [boot]);

  useEffect(() => {
    setBackEnabled(canGoBack(boot));
  }, [boot]);

  const beginSignIn = () => {
    dispatch({ type: "auth_started" });
    void startSignIn().catch((error: unknown) =>
      dispatch({ type: "auth_failed", message: failureMessage(error) })
    );
  };

  // The keychain answer is asynchronous, so the first paint is the veil alone. Rendering
  // `Shell` here would paint the workspace for a frame and then replace it with sign-in.
  if (boot.status === "loading") {
    return (
      <div className="flex min-h-dvh bg-background text-foreground">
        <BootVeil ready={false} />
      </div>
    );
  }

  if (boot.status === "onboarding") {
    return (
      <div className="flex min-h-dvh bg-background text-foreground">
        <Onboarding
          onFinish={() => {
            markOnboardingComplete();
            dispatch({ type: "onboarding_finish" });
          }}
          onPageChange={(page) => dispatch({ type: "onboarding_goto", page })}
          onSkip={() => {
            markOnboardingComplete();
            dispatch({ type: "onboarding_skip" });
          }}
          page={boot.page}
        />
      </div>
    );
  }

  if (boot.status === "signed_out" || boot.status === "authenticating") {
    return (
      <div className="flex min-h-dvh bg-background text-foreground">
        <SignIn
          error={boot.status === "signed_out" ? boot.error : null}
          onCancel={() => dispatch({ type: "session_ended" })}
          onStart={beginSignIn}
          phase={boot.status === "authenticating" ? "waiting" : "idle"}
        />
      </div>
    );
  }

  return <Shell />;
}

function failureMessage(error: unknown): string {
  return isHostFailure(error) ? error.message : "Sign-in could not start on this device.";
}
