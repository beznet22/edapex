import { Hono } from "hono";

import type { AppContext } from "../env";
import { apiError } from "../schema";
import { claimBrief, claimRoutine, completeBrief, finishRoutine } from "../services/proactive";

/**
 * Proactive-work routes.
 *
 * Every one of these is device-initiated. There is no `scheduled` handler in this
 * Worker and there must not be: spec 41 rejects a per-routine cron fan-out because
 * a hundred tenants would exceed the account-wide D1 write cap, and one documented
 * incident already reached 148,861 writes in a day.
 *
 * That means a routine only fires while a device is open. The trade is stated in
 * the UI (`ROUTINE_UNAVAILABLE_NOTICE`), not hidden here.
 */
interface TaskRow {
  id: string;
  title: string;
  why: string | null;
  created_at: number;
  open_question: number;
  blocked_on_approval: number;
  failed_after_retries: number;
  running: number;
  finished_unresolved: number;
  resolved_at: number | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
}

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

export const proactiveRoutes = new Hono<AppContext>()
  .get("/routines", async (context) => {
    const workspaceId = context.req.query("workspaceId") ?? "";
    if (workspaceId.length === 0) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    const { results } = await context.env.AGENT_DB.prepare(
      "SELECT id, workspace_id, agent_id, title, instructions, schedule, enabled, next_run_at, last_run_at \
       FROM routines WHERE workspace_id = ? ORDER BY next_run_at ASC"
    )
      .bind(workspaceId)
      .all<RoutineRow>();

    context.header("Cache-Control", "no-store");
    return context.json({ routines: results }, 200);
  })

  .get("/tasks", async (context) => {
    const workspaceId = context.req.query("workspaceId") ?? "";
    if (workspaceId.length === 0) {
      return context.json(apiError("workspaceId is required.", "invalid_request"), 400);
    }

    // Signals are returned as facts; the client derives the state with the shared
    // `deriveTaskState`, so the list and the badge cannot disagree.
    const { results } = await context.env.AGENT_DB.prepare(
      "SELECT id, title, why, created_at, open_question, blocked_on_approval, \
              failed_after_retries, running, finished_unresolved, resolved_at, \
              attempts, max_attempts, last_error \
       FROM tasks WHERE workspace_id = ? AND owner_user_id = ? ORDER BY created_at DESC LIMIT 200"
    )
      .bind(workspaceId, context.get("userId"))
      .all<TaskRow>();

    context.header("Cache-Control", "no-store");
    return context.json({
      tasks: results.map((row) => ({
        id: row.id,
        title: row.title,
        why: row.why,
        createdAt: row.created_at,
        signals: {
          openQuestion: row.open_question === 1,
          blockedOnApproval: row.blocked_on_approval === 1,
          failedAfterRetries: row.failed_after_retries === 1,
          running: row.running === 1,
          finishedUnresolved: row.finished_unresolved === 1,
          resolved: row.resolved_at !== null
        },
        attempts: row.attempts,
        maxAttempts: row.max_attempts,
        lastError: row.last_error
      }))
    }, 200);
  })
  .post("/briefs/claim", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      workspaceId?: unknown;
      localDate?: unknown;
      deviceId?: unknown;
    } | null;

    if (
      body === null ||
      typeof body.workspaceId !== "string" ||
      typeof body.localDate !== "string" ||
      typeof body.deviceId !== "string"
    ) {
      return context.json(apiError("workspaceId, localDate and deviceId are required.", "invalid_request"), 400);
    }

    const result = await claimBrief(context, {
      workspaceId: body.workspaceId,
      localDate: body.localDate,
      deviceId: body.deviceId,
      nowMilliseconds: Date.now()
    });

    if (!result.ok) return context.json(apiError(result.message, "invalid_request"), result.status);
    context.header("Cache-Control", "no-store");
    return context.json(result.result, 200);
  })

  .post("/briefs/complete", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      workspaceId?: unknown;
      localDate?: unknown;
      deviceId?: unknown;
      briefId?: unknown;
    } | null;

    if (
      body === null ||
      typeof body.workspaceId !== "string" ||
      typeof body.localDate !== "string" ||
      typeof body.deviceId !== "string" ||
      typeof body.briefId !== "string"
    ) {
      return context.json(apiError("workspaceId, localDate, deviceId and briefId are required.", "invalid_request"), 400);
    }

    const completed = await completeBrief(context, {
      workspaceId: body.workspaceId,
      localDate: body.localDate,
      deviceId: body.deviceId,
      briefId: body.briefId
    });

    // Only the claiming device may complete. A refusal here means the claim was
    // taken over or already completed, which is not a client error.
    if (!completed) {
      return context.json(apiError("This brief claim is no longer yours.", "device_unknown"), 409);
    }
    return context.body(null, 204);
  })

  .post("/routines/:id/claim", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { deviceId?: unknown; source?: unknown } | null;
    if (body === null || typeof body.deviceId !== "string") {
      return context.json(apiError("deviceId is required.", "invalid_request"), 400);
    }

    const source =
      body.source === "run_now" || body.source === "trigger" ? body.source : "schedule";

    const result = await claimRoutine(context, {
      routineId: context.req.param("id"),
      deviceId: body.deviceId,
      nowSeconds: Math.floor(Date.now() / 1000),
      source
    });

    // A refusal is a normal outcome, not an error: a 200 with a reason lets the
    // client stop cleanly rather than treating "not now" as a failure.
    return context.json(result, 200);
  })

  .post("/routines/runs/:runId/finish", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      status?: unknown;
      error?: unknown;
    } | null;

    const allowed = ["succeeded", "failed", "skipped", "waiting"];
    const status = typeof body?.status === "string" && allowed.includes(body.status)
      ? (body.status as "succeeded" | "failed" | "skipped" | "waiting")
      : null;

    if (status === null) {
      return context.json(apiError("A valid status is required.", "invalid_request"), 400);
    }

    const recorded = await finishRoutine(context, {
      runId: context.req.param("runId"),
      status,
      // Stored, not swallowed: a silent retry teaches people to distrust results.
      error: typeof body?.error === "string" ? body.error : null,
      nowSeconds: Math.floor(Date.now() / 1000)
    });

    if (!recorded) {
      return context.json(apiError("Unknown run, or it is already finished.", "device_unknown"), 404);
    }
    return context.body(null, 204);
  });
