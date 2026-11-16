"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ROUTINE_UNAVAILABLE_NOTICE, type TaskSignals } from "@edapex/contracts";

import { useAgentStore } from "@/hooks/use-agent-store";
import { runProactiveTick } from "@/lib/proactive-loop";
import { TICK_INTERVAL_MS } from "@/lib/scheduler";
import { apiBase } from "@/lib/api";

/**
 * Proactive-work wiring.
 *
 * Owns the two things that make chunk 4 real: the local store (so a task list survives a
 * reload) and the tick loop (so a routine actually fires while the tab is open). The loop's
 * transport lives in `lib/proactive-loop.ts`; what stays here is state — the store handle, the
 * device identity and the interval.
 *
 * # Why this file is careful about effect identity
 *
 * `sendAndWait` is passed from the shell and is a **new function on every render**. Listing it
 * in the tick effect's dependencies meant the effect tore down and re-created its interval on
 * every render: a tick fired immediately each time, so the app issued a request per render and
 * pinned a core. Two symptoms, one cause — the console filled with 404s and the fan came on.
 *
 * The callback is therefore held in a ref and read through it, so the interval survives a
 * re-render. That is the whole reason this hook is longer than it looks like it needs to be.
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

  /**
   * Set when either endpoint answers 404, and never cleared.
   *
   * A 404 is not transient: the route does not exist in this deployment. `cowork-api` owns
   * `/agent/routines` and `/agent/tasks`; when only `sms-api` is running they are legitimately
   * absent, and retrying them every minute forever is a console full of the same error and a
   * timer kept alive for a feature that cannot work.
   */
  const unavailable = useRef(false);
  const { deviceId, ready } = useAgentStore(workspaceId);

  // Read through a ref so a new identity from the shell cannot restart the interval.
  const sendAndWaitRef = useRef(sendAndWait);
  sendAndWaitRef.current = sendAndWait;

  const refresh = useCallback(async () => {
    // Deliberately independent of the local store: this is a server read, and gating it on
    // OPFS meant the list stayed empty whenever storage was slow, while still looking like
    // "nothing needs you".
    if (workspaceId === null || unavailable.current) return;

    try {
      const response = await fetch(
        `${apiBase()}/api/v1/agent/tasks?workspaceId=${encodeURIComponent(workspaceId)}`,
        { credentials: "include", headers: { accept: "application/json" } }
      );
      if (response.status === 404) {
        unavailable.current = true;
        return;
      }
      if (!response.ok) return;

      const body = (await response.json()) as { tasks?: readonly TaskItem[] };
      setTasks(body.tasks ?? []);
    } catch {
      // A failed refresh leaves the previous list on screen. Blanking it would read as
      // "nothing needs you", which is a different and wrong statement.
    }
  }, [workspaceId]);

  /*
   * The tick loop.
   *
   * Dependencies are only `workspaceId` and `ready`: the callback comes through the ref, and
   * `refresh` is stable for a given workspace. Anything else here re-creates the interval, and
   * an interval that restarts on render fires a tick per render.
   */
  useEffect(() => {
    if (workspaceId === null || deviceId === null || unavailable.current) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = (): void => {
      stopped = true;
      if (timer !== null) clearInterval(timer);
      timer = null;
    };

    const runTick = async (): Promise<void> => {
      if (stopped) return;

      try {
        const result = await runProactiveTick({
          workspaceId,
          deviceId,
          sendAndWait: sendAndWaitRef.current
        });
        // The transport reports a missing route rather than throwing: a 404 is an absent
        // feature, not a failed tick.
        if (result.endpointMissing) {
          unavailable.current = true;
          stop();
          return;
        }
      } catch {
        // A failed pass leaves the previous list alone; the next tick retries.
        return;
      }
      if (!stopped) await refresh();
    };

    // First tick immediately: a device opened at 08:05 should not wait a minute before
    // noticing the 08:00 routine.
    void runTick();
    timer = setInterval(() => void runTick(), TICK_INTERVAL_MS);

    return stop;
  }, [workspaceId, deviceId, ready, refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh, ready]);

  return { tasks, ready, notice: ROUTINE_UNAVAILABLE_NOTICE, refresh };
}
