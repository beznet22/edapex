"use client";

import { useEffect, useState } from "react";

import { getRuntimeHealth } from "@/lib/tauri";
import type { CoreHealth } from "@/lib/tauri";
import { isTauriHost } from "@/lib/platform";

export type RuntimeHealthStatus = "idle" | "loading" | "ready" | "error";

export interface RuntimeHealthView {
  readonly status: RuntimeHealthStatus;
  readonly health: CoreHealth | null;
  readonly error: string;
}

const idle: RuntimeHealthView = {
  status: "idle",
  health: null,
  error: ""
};

export function useRuntimeHealth(): RuntimeHealthView {
  const [view, setView] = useState<RuntimeHealthView>(idle);

  useEffect(() => {
    if (!isTauriHost()) return;
    let cancelled = false;
    setView({ status: "loading", health: null, error: "" });
    getRuntimeHealth()
      .then((health) => {
        if (!cancelled) setView({ status: "ready", health, error: "" });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setView({
            status: "error",
            health: null,
            error: cause instanceof Error ? cause.message : "Runtime health failed"
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return view;
}
