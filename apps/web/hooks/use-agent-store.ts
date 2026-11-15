"use client";

import { useEffect, useRef, useState } from "react";

import { deviceIdentity } from "@/lib/device-identity";
import { openBrowserStore, type BrowserStore } from "@/lib/browser-store";

/**
 * Opens the workspace's local store, once.
 *
 * Split from `useProactive` because it is a different lifecycle: the store is opened when
 * the workspace mounts and closed never, while the tick loop restarts on every dependency
 * change. Sharing one effect meant a re-render of the loop could re-open SQLite.
 *
 * `BrowserStore` is expensive to construct (OPFS SQLite + wasm), so the ref is deliberate:
 * this must not re-run on every render.
 */
export function useAgentStore(workspaceId: string | null): {
  readonly store: BrowserStore | null;
  readonly deviceId: string | null;
  readonly ready: boolean;
} {
  const [ready, setReady] = useState(false);
  const store = useRef<BrowserStore | null>(null);
  const device = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceId === null) return;
    let cancelled = false;

    void (async () => {
      try {
        const identity = await deviceIdentity();
        if (cancelled) return;
        device.current = identity.deviceId;

        const opened = await openBrowserStore({
          masterKey: identity.masterKey,
          filename: "/edapex-agent.db"
        });
        if (cancelled) return;
        store.current = opened;
        setReady(true);
      } catch {
        // Offline storage is optional: without OPFS the workspace still runs, it just
        // cannot persist locally. Say nothing rather than blocking the shell.
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return { store: store.current, deviceId: device.current, ready };
}
