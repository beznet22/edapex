/**
 * ==========================================
 * Layer: ROUTE — AI Domain Routes
 * ==========================================
 * Purpose:
 *   Agent Pulse SSE stream, AI session/message CRUD, task checkout.
 *   Exposes the real-time activity stream via Hono RPC.
 *
 * Endpoints:
 *   GET  /pulse          — Agent Pulse SSE stream (heartbeat ticks + cost events)
 *   POST /wakeup         — Submit wakeup request (atomic task checkout)
 *   GET  /sessions/:id   — Get session by ID
 *   GET  /status         — Heartbeat engine status
 */

import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { logger } from "../utils/logger.js";
import type { HeartbeatTick, AgentPulseEvent, WakeupRequest } from "../types/ai.types.js";

const log = logger.child({ layer: "route" });

export const aiRoutes = new Hono();

/**
 * GET /pulse — Agent Pulse SSE stream
 * Streams real-time heartbeat ticks and cost events.
 */
aiRoutes.get("/pulse", (c) => {
  const tenantId = c.req.header("x-tenant-id");
  if (!tenantId) {
    return c.json({ error: "Missing x-tenant-id header" }, 400);
  }

  return streamSSE(c, async (stream) => {
    const pulseLog = log.child({ tenantId, runId: crypto.randomUUID() });
    pulseLog.info("Agent Pulse SSE stream opened");

    // Send initial heartbeat
    const initialEvent: AgentPulseEvent = {
      eventType: "heartbeat_tick",
      tenantId,
      payload: { status: "connected" },
      timestamp: Date.now(),
    };

    await stream.writeSSE({
      data: JSON.stringify(initialEvent),
      event: "heartbeat_tick",
      id: crypto.randomUUID(),
    });

    // Keep-alive loop — yields every 15s to prevent connection timeout
    // In production, this would be driven by the HeartbeatService tick cycle
    let alive = true;
    stream.onAbort(() => {
      alive = false;
      pulseLog.info("Agent Pulse SSE stream closed by client");
    });

    while (alive) {
      await stream.sleep(15_000);
      if (!alive) break;

      const keepAlive: AgentPulseEvent = {
        eventType: "heartbeat_tick",
        tenantId,
        payload: { status: "keepalive" },
        timestamp: Date.now(),
      };

      await stream.writeSSE({
        data: JSON.stringify(keepAlive),
        event: "heartbeat_tick",
        id: crypto.randomUUID(),
      });
    }
  });
});

/**
 * POST /wakeup — Submit agent wakeup request
 * Triggers atomic task checkout via the HeartbeatService.
 * Body: { agentId, taskId?, idempotencyKey }
 */
aiRoutes.post("/wakeup", async (c) => {
  const tenantId = c.req.header("x-tenant-id");
  if (!tenantId) {
    return c.json({ error: "Missing x-tenant-id header" }, 400);
  }

  const body = await c.req.json<{ agentId: string; taskId?: string; idempotencyKey: string }>();
  if (!body.agentId || !body.idempotencyKey) {
    return c.json({ error: "Missing required fields: agentId, idempotencyKey" }, 400);
  }

  const request: WakeupRequest = {
    tenantId,
    agentId: body.agentId,
    taskId: body.taskId,
    idempotencyKey: body.idempotencyKey,
    requestedAt: Date.now(),
  };

  // NOTE: HeartbeatService is injected at app boot — placeholder for DI wiring
  // const tick = await heartbeatService.processWakeup(request);
  const tick: HeartbeatTick = {
    tickId: crypto.randomUUID(),
    tenantId,
    status: "idle",
    claimedTaskId: null,
    agentId: request.agentId,
    timestampMs: Date.now(),
    driftMs: 0,
  };

  log.child({ tenantId }).info("Wakeup request processed", { tickId: tick.tickId });
  return c.json(tick);
});

/**
 * GET /status — Heartbeat engine status
 */
aiRoutes.get("/status", (c) => {
  return c.json({
    status: "idle",
    uptime: Date.now(),
    version: "phase-1",
  });
});
