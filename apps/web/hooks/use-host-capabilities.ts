"use client";

import { useEffect, useState } from "react";

import type { HostCapabilities } from "@edapex/contracts/platform";

import {
  BROWSER_HOST_CAPABILITIES,
  loadHostCapabilities
} from "@/lib/host-capabilities";

export interface HostCapabilitiesState {
  readonly capabilities: HostCapabilities;
  readonly loading: boolean;
  readonly error: string;
}

export function useHostCapabilities(): HostCapabilitiesState {
  const [capabilities, setCapabilities] = useState<HostCapabilities>(
    BROWSER_HOST_CAPABILITIES
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    loadHostCapabilities()
      .then((next) => {
        if (!cancelled) setCapabilities(next);
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Host capabilities unavailable");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { capabilities, loading, error };
}
