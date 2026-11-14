import { Hono } from "hono";

import type { AppContext } from "../env";
import {
  apiError,
  pullQuerySchema,
  pushSchema,
  registerDeviceSchema
} from "../schema";
import { listDevices, pull, push, registerDevice, revokeDevice } from "../services/sync";

/**
 * Device registry and the sync channel.
 *
 * Mounted at `/api/v1/agent` behind `authenticate`. Every handler is scoped to
 * the calling user: a device id from another account resolves to `device_unknown`
 * rather than being touched.
 */
export const agentSync = new Hono<AppContext>()
  .get("/devices", async (context) => {
    const devices = await listDevices(context.env.AGENT_DB, context.get("userId"));
    return context.json({ devices }, 200);
  })

  .post("/devices", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(apiError("A JSON body is required.", "invalid_request"), 400);
    }

    const parsed = registerDeviceSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        apiError(parsed.error.issues[0]?.message ?? "Invalid device.", "invalid_request"),
        400
      );
    }

    const device = await registerDevice(context.env.AGENT_DB, context.get("userId"), parsed.data);
    return context.json({ device }, 201);
  })

  .delete("/devices/:id", async (context) => {
    const revoked = await revokeDevice(
      context.env.AGENT_DB,
      context.get("userId"),
      context.req.param("id")
    );
    if (!revoked) {
      return context.json(apiError("Unknown device.", "device_unknown"), 404);
    }
    return context.body(null, 204);
  })

  .post("/sync/push", async (context) => {
    let body: unknown;
    try {
      body = await context.req.json();
    } catch {
      return context.json(apiError("A JSON body is required.", "invalid_request"), 400);
    }

    const parsed = pushSchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        apiError(parsed.error.issues[0]?.message ?? "Invalid push.", "invalid_request"),
        400
      );
    }

    const result = await push(context.env.AGENT_DB, context.get("userId"), parsed.data);
    if (!result.ok) return context.json(result.error, result.status);
    return context.json({ accepted: result.accepted, cursor: result.cursor }, 200);
  })

  .get("/sync/pull", async (context) => {
    const parsed = pullQuerySchema.safeParse(context.req.query());
    if (!parsed.success) {
      return context.json(
        apiError(parsed.error.issues[0]?.message ?? "Invalid pull.", "invalid_request"),
        400
      );
    }

    const result = await pull(context.env.AGENT_DB, context.get("userId"), parsed.data);
    if (!result.ok) return context.json(result.error, result.status);
    return context.json({ events: result.events, nextCursor: result.nextCursor }, 200);
  });
