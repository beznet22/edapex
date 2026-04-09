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
import { HeartbeatService } from "../services/ai/heartbeat.service.js";
import { AIService } from "../services/ai/ai.service.js";
import { FinanceService } from "../services/finance/finance.service.js";
import { RepositoryFactory } from "../domain/repositories/factory.js";
import { unifiedConfig } from "../config/index.js";

const log = logger.child({ layer: "route" });

export const aiRoutes = new Hono();

/**
 * Utility to get services based on environment
 */
function getServices(c: any) {
  const dialect = c.env?.D1_DB ? "d1" : (process.env.DATABASE_DIALECT || "mysql");
  const aiRepo = RepositoryFactory.getAiRepository(dialect);
  const findRepo = RepositoryFactory.getFinanceEventRepository(dialect);
  
  const financeService = new FinanceService(findRepo);
  const aiService = new AIService(aiRepo, financeService);
  const heartbeatService = new HeartbeatService(unifiedConfig, aiRepo);
  
  return { aiService, heartbeatService, financeService };
}

/**
 * GET /pulse — Agent Pulse SSE stream
 * Streams real-time heartbeat ticks and cost events.
 */
aiRoutes.get("/pulse", (c) => {
  const headerTenantId = c.req.header("x-tenant-id");
  const queryTenantId = c.req.query("tenantId");
  const tenantId = headerTenantId || queryTenantId;

  if (!tenantId) {
    return c.json({ error: "Missing tenantId (header or query)" }, 400);
  }

  return streamSSE(c, async (stream) => {
    const { heartbeatService } = getServices(c);
    const pulseLog = log.child({ tenantId, runId: crypto.randomUUID() });
    pulseLog.info("Agent Pulse SSE stream opened");

    // Send initial heartbeat
    const initialEvent: AgentPulseEvent = {
      eventType: "heartbeat_tick",
      tenantId,
      payload: { status: heartbeatService.getStatus() },
      timestamp: Date.now(),
    };

    await stream.writeSSE({
      data: JSON.stringify(initialEvent),
      event: "heartbeat_tick",
      id: crypto.randomUUID(),
    });

    // Keep-alive and event loop
    let alive = true;
    let lastEventSync = Date.now();

    stream.onAbort(() => {
      alive = false;
      pulseLog.info("Agent Pulse SSE stream closed by client");
    });

    const { financeService } = getServices(c);

    while (alive) {
      // 1. Check for New Finance Events (every 5s)
      try {
        const events = await financeService.listEvents(tenantId);
        const newEvents = events.filter(e => {
          const createdAt = e.createdAt ? new Date(e.createdAt).getTime() : 0;
          return createdAt > lastEventSync;
        });
        
        for (const event of newEvents) {
          const createdAt = event.createdAt ? new Date(event.createdAt).getTime() : Date.now();
          const pulseEvent: AgentPulseEvent = {
            eventType: "cost_event",
            tenantId,
            payload: {
              category: event.category,
              amountCents: event.amountCents,
              currency: event.currency,
              description: event.description,
              balanceAfterCents: event.balanceAfterCents
            },
            timestamp: createdAt,
          };

          await stream.writeSSE({
            data: JSON.stringify(pulseEvent),
            event: "cost_event",
            id: crypto.randomUUID(),
          });
        }
        
        if (newEvents.length > 0) {
          lastEventSync = Date.now();
        }
      } catch (err) {
        pulseLog.error("Error polling finance events in SSE loop", { error: err });
      }

      // 2. Heartbeat Tick (every 15s - keepalive)
      const heartbeat: AgentPulseEvent = {
        eventType: "heartbeat_tick",
        tenantId,
        payload: { 
          status: heartbeatService.getStatus(),
          engine: heartbeatService.getStatus() 
        },
        timestamp: Date.now(),
      };

      await stream.writeSSE({
        data: JSON.stringify(heartbeat),
        event: "heartbeat_tick",
        id: crypto.randomUUID(),
      });

      await stream.sleep(5_000); // Check every 5s for cost events
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

  const { heartbeatService } = getServices(c);

  const request: WakeupRequest = {
    tenantId,
    agentId: body.agentId,
    taskId: body.taskId,
    idempotencyKey: body.idempotencyKey,
    requestedAt: Date.now(),
  };

  const tick = await heartbeatService.processWakeup(request);

  log.child({ tenantId }).info("Wakeup request processed", { 
    tickId: tick.tickId, 
    status: tick.status, 
    claimedTaskId: tick.claimedTaskId 
  });

  return c.json(tick);
});

/**
 * GET /status — Heartbeat engine status
 */
aiRoutes.get("/status", (c) => {
  const { heartbeatService } = getServices(c);
  return c.json({
    status: heartbeatService.getStatus(),
    uptime: Date.now(),
    version: "phase-1",
  });
});
