"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";

import type { CapabilityManifest } from "@edapex/contracts";

import { ArtifactHost } from "@/components/artifacts/ArtifactHost";
import { LoginPanel } from "@/components/auth/LoginPanel";
import { useEmailSignIn } from "@/hooks/use-email-sign-in";
import { noticeFromQuery, type LoginNotice } from "@/lib/auth-notice";
import { apiBase, getSession, loadCapabilities, requestMagicLink } from "@edapex/host/api";
import type { SessionView } from "@edapex/host/api";

import { useProactive } from "@/hooks/use-proactive";
import { useWorkspaceRuntime } from "@/hooks/use-workspace-runtime";
import { useAutoHideScrollbars } from "@/hooks/use-auto-hide-scrollbars";
import { useRuntimeHealth } from "@/hooks/use-runtime-health";
import { activeItemId, filterTreeForRole, treeForPath } from "@/lib/nav-tree";
import { TEST_MANIFEST, TEST_SESSION, testSessionEnabled } from "@/lib/test-session";
import { isDesktopViewport } from "@edapex/host/platform";
import type { SidebarState } from "@/lib/sidebar-state";
import { useSidebarState } from "@/lib/sidebar-state-hooks";
import type { WorkspaceTab } from "@/components/openduet/tab-bar";
import { Button } from "@edapex/ui/components/button";
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
  if (path === "/workspace/admin" || path.startsWith("/workspace/admin/")) return "admin";
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
  /*
   * `?auth_error=expired` is set by the API when a magic link cannot be verified and the
   * request came from a browser. Read once on mount: leaving it in the URL would replay the
   * message on every refresh, long after the person has retried.
   */
  const [initialNotice] = useState<LoginNotice>(() =>
    typeof window === "undefined" ? { kind: "idle" } : noticeFromQuery(window.location.search)
  );
  const signIn = useEmailSignIn(initialNotice);

  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [session, setSession] = useState<SessionView | null>(null);
  const [manifest, setManifest] = useState<CapabilityManifest | null>(null);

  /*
   * The tree is filtered by role before anything renders, so a teacher never sees a
   * destination that would 403. `manifest` is null while capabilities load — until then the
   * role is unknown and role-gated items stay hidden, which is the safe direction.
   */
  const navTree = useMemo(
    () => filterTreeForRole(treeForPath(pathname), manifest?.role ?? null),
    [pathname, manifest]
  );
  const activeNavId = activeItemId(navTree, pathname);

  const [academicId, setAcademicId] = useState(5);
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
  const proactive = useProactive(session?.workspaceId ?? null, runtime.sendAndWait);
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
    /*
     * The browser suite needs a deterministic starting state without driving an email
     * flow on every spec. `testSessionEnabled()` requires both the flag *and* a loopback
     * API base, so it cannot activate a deployed bundle.
     */
    if (testSessionEnabled()) {
      setSession(TEST_SESSION);
      setManifest(TEST_MANIFEST);
      setSessionState("authenticated");
      runtime.restoreComplete();
      return;
    }

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
    // The fixture already resolved the manifest; fetching would hit an API the suite
    // does not run.
    if (testSessionEnabled() || sessionState !== "authenticated") return;
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


  if (sessionState === "loading") {
    return <WorkspaceBoot surface={surface} />;
  }

  if (sessionState === "anonymous") {
    return (
      <LoginPanel
        email={signIn.email}
        onEmailChange={signIn.setEmail}
        onGoogle={() => window.location.assign(`${apiBase()}/api/v1/auth/google/start`)}
        onReset={signIn.reset}
        onSubmit={signIn.submit}
        notice={initialNotice.kind === "idle" ? signIn.notice : initialNotice}
        sending={signIn.sending}
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
  // The session names its workspace; the fallback exists only for the pre-auth render, where
  // no surface is mounted yet.
  const workspaceId = session?.workspaceId ?? "workspace";
  const contextValue = { manifest, workspaceId, academicId, runtime, proactive, openArtifact };

  return (
    <WorkspaceProvider value={contextValue}>
      <WorkspaceShell
        manifest={manifest}
        activeNavId={activeNavId}
        connecting={runtime.connecting}
        coreHealth={runtimeHealth.health}
        navTree={navTree}

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
