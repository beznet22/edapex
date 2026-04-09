import { createMiddleware } from "hono/factory";
import { logger } from "../utils/logger.js";

const log = logger.child({ layer: "middleware", name: "pbacEvaluator" });

/**
 * PBAC Evaluator Middleware
 * 
 * Enforces Policy-Based Access Control at the Edge.
 * 1. Checks Cloudflare KV for cached roles.
 * 2. If miss, fallbacks to D1 (via future service injection or direct fetch).
 * 3. Validates required scopes/roles.
 */
export const pbacEvaluator = (requiredRoles: string[]) => {
  return createMiddleware<{ Bindings: { EDAPEX_PBAC_KV: any } }>(async (c, next) => {
    // 1. Extract Identity
    // Note: In a real scenario, these come from the session context (Better-Auth)
    // For V2 prototype, we look for headers or c.get('user')
    const userId = c.req.header("x-user-id");
    const tenantId = c.req.header("x-tenant-id");

    if (!userId || !tenantId) {
      log.warn("Missing identity headers for PBAC check", { userId, tenantId });
      return c.json({ error: "Unauthorized: Missing Identity" }, 401);
    }

    try {
      // 2. KV Lookup
      const cacheKey = `pbac:${tenantId}:${userId}`;
      let roles: string[] | null = null;
      
      const cached = await c.env.EDAPEX_PBAC_KV?.get(cacheKey);
      
      if (cached) {
        roles = JSON.parse(cached);
        log.debug("Cache hit for PBAC roles", { userId, tenantId, roles });
      } else {
        // 3. D1 Fallback (Placeholder for now, logic to be integrated with PBACService)
        // In this implementation, we assume if KV is empty, we must deny or fetch.
        // For the sake of the execution plan, we'll log a miss.
        log.info("Cache miss for PBAC roles", { userId, tenantId });
        
        // TODO: Integrate with Drizzle/D1 here if needed, or rely on a previous auth middleware
        // for now, we'll assume roles are passed in a way that allows us to proceed if we want to bypass cache
        return c.json({ error: "Forbidden: No roles identified (Cache Miss)" }, 403);
      }

      // 4. Role Validation
      const hasAccess = requiredRoles.every((role) => roles?.includes(role));

      if (!hasAccess) {
        log.warn("Insufficient roles for request", { userId, tenantId, roles, requiredRoles });
        return c.json({ error: "Forbidden: Insufficient privileges" }, 403);
      }

      await next();
    } catch (error) {
      log.error("PBAC evaluation failed", { error });
      return c.json({ error: "Internal Server Error: PBAC Failure" }, 500);
    }
  });
};
