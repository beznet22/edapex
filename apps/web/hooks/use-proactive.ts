"use client";

import { useCallback, useEffect, useState } from "react";

import { ROUTINE_UNAVAILABLE_NOTICE, type TaskSignals } from "@edapex/contracts";

import { useAgentStore } from "@/hooks/use-agent-store";
import { runProactiveTick } from "@/lib/proactive-loop";
import { TICK_INTERVAL_MS } from "@/lib/scheduler";
import { apiBase } from "@/lib/api";

/**
 * Proactive-work wiring.
 *
 * Owns the two things that make chunk 4 real: the local store (so a task list survives a
 * reload) and the tick loop (so a routine actually fires while the tab is open). The loop
 * is the whole acceptance criterion — without it the claim protocol is a library nobody
 * calls.
 *
 * The loop's transport lives in `lib/proactive-loop.ts`. What stays here is state: the
 * store handle, the device identity and the interval. None of those are transport, and all
 * of them need a mounted component.
 */

export interface TaskItem {
  readonly id: string;
  readonly title: string;
  readonly why: string | null;
  readonly createdAt: number;
  readonly signals: TaskSignals;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
}

export interface ProactiveController {
  readonly tasks: readonly TaskItem[];
  readonly ready: boolean;
  /** Shown in the UI, because the trade is the user's to know. */
  readonly notice: string;
  readonly refresh: () => Promise<void>;
}

export function useProactive(
  workspaceId: string | null,
  /** Provided by the shell. Absent means the runtime is not connected yet. */
  sendAndWait?: (text: string) => Promise<{
    readonly status: "succeeded" | "waiting" | "failed";
    readonly error?: string;
  }>
): ProactiveController {
  const [tasks, setTasks] = useState<readonly TaskItem[]>([]);
  const { deviceId, ready } = useAgentStore(workspaceId);

  const refresh = useCallback(async () => {
    // Deliberately independent of the local store: this is a server read, and
    // gating it on OPFS meant the list stayed empty whenever storage was slow or
    // unavailable, while still looking like "nothing needs you".
    if (workspaceId === null) return;

    try {
      const response = await fetch(
        `${apiBase()}/api/v1/agent/tasks?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "include", headers: { accept: "application/json" } }
      );
      if (!response.ok) return;

      const body = (await response.json()) as { tasks?: readonly TaskItem[] };
      setTasks(body.tasks ?? []);
    } catch {
      // A failed refresh leaves the previous list on screen. Blanking it would
      // read as "nothing needs you", which is a different and wrong statement.
    }
  }, [workspaceId]);

  // The tick loop. Routines only fire while this is mounted, which is the trade
  // the notice states.
  useEffect(() => {
    if (workspaceId === null || deviceId === null) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const runTick = async (): Promise<void> => {
      if (stopped) return;
      // The store is not a prerequisite for the loop any more than it is for `refresh`:
      // a tick that cannot persist is still a tick that should fire.
      try {
        await runProactiveTick({ workspaceId, deviceId, sendAndWait });
      } catch {
        // A failed pass leaves the previous list alone; the next tick retries.
        return;
      }
      if (!stopped) await refresh();
    };

    // First tick immediately: a device opened at 08:05 should not wait a minute
    // before noticing the 08:00 routine.
    void runTick();
    timer = setInterval(() => void runTick(), TICK_INTERVAL_MS);

    return () => {
      stopped = true;
      if (timer !== null) clearInterval(timer);
    };
  }, [workspaceId, ready, refresh, sendAndWait]);

  useEffect(() => {
    void refresh();
  }, [refresh, ready]);

  return { tasks, ready, notice: ROUTINE_UNAVAILABLE_NOTICE, refresh };
}
