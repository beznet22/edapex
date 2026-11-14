"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/workspace" })
      .catch(() => {
        // Installation is optional. A failed registration must not block the workspace.
      });
  }, []);

  return null;
}
