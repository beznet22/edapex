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
export const proactiveRoutes = new Hono<AppContext>()
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
