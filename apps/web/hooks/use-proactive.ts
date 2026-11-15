"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ROUTINE_UNAVAILABLE_NOTICE,
  type RoutineView,
  type TaskSignals
} from "@edapex/contracts";

import { deviceIdentity } from "@/lib/device-identity";
import { openBrowserStore, type BrowserStore } from "@/lib/browser-store";
import { shouldTick, tick, TICK_INTERVAL_MS } from "@/lib/scheduler";
import { apiBase } from "@/lib/api";

/**
 * Proactive-work wiring.
 *
 * Owns the two things that make chunk 4 real: the local store (so a task list
 * survives a reload) and the tick loop (so a routine actually fires while the tab
 * is open). The loop is the whole acceptance criterion — without it the claim
 * protocol is a library nobody calls.
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

/** A routine as the server stores it, mapped to the shared view shape. */
interface RoutineRow {
  id: string;
  workspace_id: string;
  agent_id: string;
  title: string;
  instructions: string;
  schedule: string;
  enabled: number;
  next_run_at: number | null;
  last_run_at: number | null;
}

async function jsonRequest(path: string, body: unknown): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
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
  const [ready, setReady] = useState(false);
  const store = useRef<BrowserStore | null>(null);
  const device = useRef<string | null>(null);

  // Opens the store once. `BrowserStore` is expensive to construct (OPFS SQLite +
  // wasm), so it is deliberately not recreated on every render.
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
        // Offline storage is optional: without OPFS the workspace still runs, it
        // just cannot persist locally. Say nothing rather than blocking the shell.
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

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
    if (workspaceId === null) return;
    const deviceId = device.current;
    if (deviceId === null) return;

    let stopped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const runTick = async (): Promise<void> => {
      if (stopped) return;
      if (document.visibilityState === "hidden") return;

      const current = store.current;
      if (current === null) return;

      let routines: RoutineView[];
      try {
        const response = await fetch(
          `${apiBase()}/api/v1/agent/routines?workspaceId=${encodeURIComponent(workspaceId)}`,
          { credentials: "include", headers: { accept: "application/json" } }
        );
        if (!response.ok) return;
        const body = (await response.json()) as { routines?: readonly RoutineRow[] };
        routines = (body.routines ?? []).map((row) => ({
          id: row.id,
          workspaceId: row.workspace_id,
          agentId: row.agent_id,
          title: row.title,
          instructions: row.instructions,
          schedule: row.schedule,
          enabled: row.enabled === 1,
          nextRunAt: row.next_run_at,
          lastRunAt: row.last_run_at
        }));
      } catch {
        return;
      }

      if (!shouldTick({ documentHidden: false, hasRoutines: routines.length > 0 })) return;

      await tick(
        {
          routines: async () => routines,
          claim: async (routineId, id) => {
            const response = await jsonRequest(
              `/api/v1/agent/routines/${encodeURIComponent(routineId)}/claim`,
              { deviceId: id, source: "schedule" }
            );
            if (!response.ok) return { kind: "refused", reason: "request_failed" };
            return (await response.json()) as
              | { kind: "claimed"; runId: string; takeover: boolean }
              | { kind: "refused"; reason: string };
          },
          run: async (routine) => {
            // The routine is a normal turn: same runtime, same approvals, same
            // transcript. `sendAndWait` reports how it settled — `waiting` when it
            // stopped for a person, which is recorded as waiting, not as failure.
            if (sendAndWait === undefined) {
              return { status: "failed", error: "the agent runtime is not connected" };
            }
            return sendAndWait(routine.instructions);
          },
          finish: async (runId, status, error) => {
            await jsonRequest(
              `/api/v1/agent/routines/runs/${encodeURIComponent(runId)}/finish`,
              { status, error }
            );
          },
          markRan: async () => {
            // The server advances `next_run_at` on claim; nothing local to write
            // until the store owns routine rows.
          },
          now: () => Math.floor(Date.now() / 1000)
        },
        deviceId
      );

      await refresh();
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
