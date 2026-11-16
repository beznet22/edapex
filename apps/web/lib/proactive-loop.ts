import type { RoutineView } from "@edapex/contracts";

import { apiBase } from "@/lib/api";
import { shouldTick, tick, type SchedulerDeps } from "@/lib/scheduler";

/**
 * The proactive tick loop's transport, extracted from the hook.
 *
 * The hook was 229 lines against a 120 cap, and the excess was not React: it was the
 * routine fetch, the row mapping, the claim/run/finish ports and the visibility check.
 * None of that needs a component to exist, so none of it belongs in one — the hook keeps
 * the state and the interval, and this module does the talking.
 */

/** A routine as the server returns it, mapped to the shared view shape. */
interface RoutineRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly agent_id: string;
  readonly title: string;
  readonly instructions: string;
  readonly schedule: string;
  readonly enabled: number;
  readonly next_run_at: number | null;
  readonly last_run_at: number | null;
}

async function jsonRequest(path: string, body: unknown): Promise<Response> {
  return fetch(`${apiBase()}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

/**
 * The routines the server says exist for this workspace.
 *
 * Returns `null` when the route does not exist. That is different from an empty list: an
 * empty list means "no routines", a missing route means "this deployment has no proactive
 * feature", and the caller must stop asking rather than treat the absence as emptiness.
 */
export async function fetchRoutines(
  workspaceId: string
): Promise<readonly RoutineView[] | null> {
  const response = await fetch(
    `${apiBase()}/api/v1/agent/routines?workspaceId=${encodeURIComponent(workspaceId)}`,
    { credentials: "include", headers: { accept: "application/json" } }
  );
  if (response.status === 404) return null;
  if (!response.ok) return [];
  const body = (await response.json()) as { routines?: readonly RoutineRow[] };
  return (body.routines ?? []).map((row) => ({
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
}

export interface TickRun {
  /** How many routines ran. Zero is the normal case and not a failure. */
  readonly ran: number;
  /** True when `/agent/routines` answered 404 — the feature is absent, not failing. */
  readonly endpointMissing: boolean;
}

/**
 * One pass of the loop.
 *
 * `sendAndWait` is the whole point: a routine fires a *normal turn* — same runtime, same
 * approvals, same transcript — and reports how it settled. `waiting` means it stopped for
 * a person, which is a recorded state, not an error.
 */
export async function runProactiveTick(options: {
  readonly workspaceId: string;
  readonly deviceId: string;
  readonly sendAndWait?: (text: string) => Promise<{
    readonly status: "succeeded" | "waiting" | "failed";
    readonly error?: string;
  }>;
}): Promise<TickRun> {
  const routines = await fetchRoutines(options.workspaceId);
  if (routines === null) {
    return { ran: 0, endpointMissing: true };
  }

  /*
   * Routines only fire while the tab is visible, which is the trade the notice states.
   * Checked here rather than in the hook so the rule travels with the loop that depends
   * on it — a caller that forgets the check would run routines in a background tab.
   */
  if (
    !shouldTick({
      documentHidden: typeof document !== "undefined" && document.visibilityState === "hidden",
      hasRoutines: routines.length > 0
    })
  ) {
    return { ran: 0, endpointMissing: false };
  }

  const deps: SchedulerDeps = {
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
      if (options.sendAndWait === undefined) {
        return { status: "failed", error: "the agent runtime is not connected" };
      }
      return options.sendAndWait(routine.instructions);
    },
    finish: async (runId, status, error) => {
      await jsonRequest(`/api/v1/agent/routines/runs/${encodeURIComponent(runId)}/finish`, {
        status,
        error
      });
    },
    markRan: async () => {
      // The server advances `next_run_at` on claim; nothing local to write until the
      // store owns routine rows.
    },
    now: () => Math.floor(Date.now() / 1000)
  };

  const outcomes = await tick(deps, options.deviceId);
  return { ran: outcomes.length, endpointMissing: false };
}
