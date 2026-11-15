"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { CapabilityManifest } from "@edapex/contracts";

import { ArtifactHost } from "@/components/artifacts/ArtifactHost";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { apiBase, getSession, loadCapabilities, requestMagicLink } from "@/lib/api";
import type { SessionView } from "@/lib/api";
import {
  DEV_AUTH_BYPASS,
  DEV_PREVIEW_MANIFEST,
  DEV_PREVIEW_SESSION
} from "@/lib/dev-preview";
import { useProactive } from "@/hooks/use-proactive";
import { useWorkspaceRuntime } from "@/hooks/use-workspace-runtime";
import { useAutoHideScrollbars } from "@/hooks/use-auto-hide-scrollbars";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";
import { activeItemId, treeForPath } from "@/lib/nav-tree";
import { isDesktopViewport } from "@/lib/platform";
import type { SidebarState } from "@/lib/sidebar-state";
import { useSidebarState } from "@/lib/sidebar-state-hooks";
import type { WorkspaceTab } from "@/components/openduet/tab-bar";
import { Button } from "@/components/ui/button";
import { ChatSurface } from "@/components/workspace/ChatSurface";
import { CommandPalette } from "@/components/workspace/CommandPalette";
import { WorkspaceBoot } from "@/components/workspace/WorkspaceBoot";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceContext";
import { RuntimeSetup } from "@/components/workspace/RuntimeSetup";
import { WorkspaceShell } from "@/components/workspace/WorkspaceShell";

type SessionState = "loading" | "anonymous" | "authenticated";
type AuthMode = "google" | "email";

function surfaceForPath(pathname: string): WorkspaceTab {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/workspace/tasks") return "tasks";
  if (path === "/workspace/make") return "make";
  if (path === "/workspace/plugins" || path.startsWith("/workspace/plugins/")) return "plugins";
  if (path === "/workspace/search" || path.startsWith("/workspace/search/")) return "search";
  if (path === "/workspace/settings" || path.startsWith("/workspace/settings/")) return "settings";
  return "chat";
}

export function WorkspaceLayoutClient({
  children,
  initialSidebar
}: {
  readonly children: ReactNode;
  readonly initialSidebar: SidebarState;
}) {
  // The collapsed state is a width decision, so it comes from the server: reading a
  // cookie in an effect renders the rail expanded and then snaps it, which is a visible
  // layout shift on every load.
  // No custom Cmd+B handler: shadcn's SidebarProvider binds it already. Two handlers
  // toggle twice, so the rail appears not to respond.
  const sidebar = useSidebarState(initialSidebar);

  const pathname = usePathname();
  const surface = surfaceForPath(pathname);
  // Derived from the route, not from state: the tree must be correct on the first paint,
  // and a `useEffect` that set it would render the workspace tree for one frame on a
  // settings route.
  const navTree = treeForPath(pathname);
  const activeNavId = activeItemId(navTree, pathname);
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [session, setSession] = useState<SessionView | null>(null);
  const [manifest, setManifest] = useState<CapabilityManifest | null>(null);
  const [academicId, setAcademicId] = useState(5);
  const [authMode, setAuthMode] = useState<AuthMode>("google");
  const [email, setEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authSending, setAuthSending] = useState(false);
  const [error, setError] = useState("");
  const [loadingManifest, setLoadingManifest] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [artifactSplit, setArtifactSplit] = useState(false);
  const runtime = useWorkspaceRuntime();
  // Mounted here rather than in the Tasks page so the tick loop keeps running
  // while the person is on Chat — a routine due at 08:00 should fire even if the
  // Tasks tab is not open. The trade (only while a device is open) is stated in
  // the surface copy.
  const proactive = useProactive(
    session === null ? null : String(session.user.id),
    runtime.sendAndWait
  );
  const runtimeHealth = useRuntimeHealth();
  // One capture-phase listener for every scroll container in the tree.
  useAutoHideScrollbars();

  const closeArtifact = useCallback((): void => setArtifactOpen(false), []);
  const openArtifact = useCallback((): void => setArtifactOpen(true), []);

  useEffect(() => {
    const update = (): void => setArtifactSplit(isDesktopViewport());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    if (surface !== "chat") {
      setArtifactOpen(false);
    }
  }, [surface]);

  useEffect(() => {
    const stored = Number(window.localStorage.getItem("edapex.academicId") ?? "5");
    if (Number.isInteger(stored) && stored > 0) {
      setAcademicId(stored);
    }
  }, []);

  useEffect(() => {
    if (!DEV_AUTH_BYPASS) return;
    setSession(DEV_PREVIEW_SESSION);
    setManifest(DEV_PREVIEW_MANIFEST);
    setSessionState("authenticated");
    runtime.restoreComplete();
  }, []);

  useEffect(() => {
    if (DEV_AUTH_BYPASS) return;
    let cancelled = false;
    getSession()
      .then((current) => {
        if (cancelled) return;
        setSession(current);
        setSessionState(current === null ? "anonymous" : "authenticated");
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSessionState("anonymous");
        setError(cause instanceof Error ? cause.message : "Session check failed");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (DEV_AUTH_BYPASS || sessionState !== "authenticated") return;
    let cancelled = false;
    setLoadingManifest(true);
    setError("");
    loadCapabilities(academicId)
      .then((loaded) => {
        if (cancelled) return;
        setManifest(loaded);
        runtime.restoreComplete();
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load capabilities");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingManifest(false);
      });
    return () => {
      cancelled = true;
    };
  }, [academicId, reloadToken, sessionState]);

  const sendMagicLink = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (authSending) return;
    setAuthMessage("");
    if (email.trim().length === 0) {
      setAuthMessage("Enter your school email address.");
      return;
    }
    setAuthSending(true);
    try {
      await requestMagicLink(email.trim());
      setAuthMessage("Check your email for a sign-in link. The link is valid for 15 minutes.");
    } catch (cause) {
      setAuthMessage(cause instanceof Error ? cause.message : "Could not send the sign-in link");
    } finally {
      setAuthSending(false);
    }
  };

  if (sessionState === "loading") {
    return <WorkspaceBoot surface={surface} />;
  }

  if (sessionState === "anonymous") {
    return (
      <LoginPanel
        authMessage={authMessage}
        authMode={authMode}
        description="Sign in with the Google account linked to your school account, or request a magic link. The workspace keeps EdApex data on Cloudflare."
        email={email}
        error={error}
        eyebrow="EdApex workspace"
        onEmailChange={setEmail}
        onGoogle={() => window.location.assign(`${apiBase()}/api/v1/auth/google/start`)}
        onMagicLink={(event) => void sendMagicLink(event)}
        onModeChange={setAuthMode}
        sending={authSending}
        title="Sign in to your workspace"
      />
    );
  }

  if (manifest === null) {
    if (loadingManifest) {
      return <WorkspaceBoot surface={surface} />;
    }
    return (
      <main className="flex min-h-dvh items-center justify-center bg-background px-4">
        <section className="w-full max-w-md rounded-xl border border-border bg-card p-6">
          <h1 className="text-lg font-semibold">Workspace unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || "Could not load the workspace."}</p>
          <Button
            className="mt-4"
            onClick={() => setReloadToken((value) => value + 1)}
            type="button"
          >
            Try again
          </Button>
        </section>
      </main>
    );
  }

  const userName = session?.user.fullName ?? session?.user.email ?? "Signed in";
  const workspaceId = String(session?.user.id ?? "workspace");
  const contextValue = { manifest, workspaceId, runtime, proactive, openArtifact };

  return (
    <WorkspaceProvider value={contextValue}>
      <WorkspaceShell
        manifest={manifest}
        activeNavId={activeNavId}
        connecting={runtime.connecting}
        coreHealth={runtimeHealth.health}
        navTree={navTree}
        devBypass={DEV_AUTH_BYPASS}
        onConnectRuntime={() => setSetupDismissed(false)}
        onOpenArtifact={surface === "chat" ? openArtifact : undefined}
        setSidebarOpen={sidebar.setOpen}
        sidebarOpen={sidebar.open}
        runtime={runtime.view}
        surface={surface}
        userName={userName}
      >
        {children}
      </WorkspaceShell>
      <CommandPalette />
      <ArtifactHost
        chat={
          surface === "chat" ? (
            <ChatSurface
              compact
              manifest={manifest}
              messages={runtime.messages}
              onApproval={runtime.decideApproval}
              onRemoveQueued={runtime.removeQueued}
              onSend={runtime.send}
              onStop={runtime.stop}
              queue={runtime.queue}
              runtime={runtime.view}
            />
          ) : null
        }
        onClose={closeArtifact}
        open={artifactOpen}
        split={artifactSplit}
      />
      {!runtime.connected && !setupDismissed ? (
        <RuntimeSetup
          connecting={runtime.connecting}
          error={runtime.connectError}
          onConnect={runtime.connectAgent}
          onDismiss={() => {
            setSetupDismissed(true);
            runtime.restoreComplete();
          }}
          workspaceId={workspaceId}
        />
      ) : null}
    </WorkspaceProvider>
  );
}
