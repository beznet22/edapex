import { Hono } from "hono";
import { webFetchRequestSchema, webSearchRequestSchema } from "@edapex/contracts/web";

import {
  createService,
  RateLimitService,
  TenantScopeError,
  WebFetchService,
  WebSearchService
} from "../../services";
import type { AppContext } from "../env";
import { requireStaff } from "../middleware/authorize";
import { jsonBody } from "../validation";

const quotaKey = (
  schoolId: number | null | undefined,
  userId: number,
  prefix: string
): string => {
  if (schoolId === null || schoolId === undefined) {
    throw new TenantScopeError("Web tools require a tenant scope");
  }
  return `web:${prefix}:${schoolId}:${userId}`;
};

export const agentWeb = new Hono<AppContext>()
  .use("*", requireStaff)
  .post("/search", jsonBody(webSearchRequestSchema), async (c) => {
    const user = c.get("user");
    if (user === null) throw new TenantScopeError("Web search requires an authenticated user");
    const body = c.req.valid("json");
    const base = c.get("baseCtx");
    const tenant = c.get("ctx").tenant;
    const now = base.ports.clock.now();
    const quotas = createService(RateLimitService, base);
    const key = quotaKey(tenant?.schoolId, user.id, "search");
    await quotas.consume(`${key}:minute`, { limit: 30, windowSeconds: 60 }, now);
    await quotas.consume(`${key}:hour`, { limit: 300, windowSeconds: 3_600 }, now);
    await quotas.consume(`${key}:day`, { limit: 2_000, windowSeconds: 86_400 }, now);
    const result = await createService(WebSearchService, c.get("ctx")).search(body);
    c.header("Cache-Control", "no-store");
    return c.json({ ...result, query: body.query, cached: false }, 200);
  })
  .post("/fetch", jsonBody(webFetchRequestSchema), async (c) => {
    const user = c.get("user");
    if (user === null) throw new TenantScopeError("Web fetch requires an authenticated user");
    const body = c.req.valid("json");
    const base = c.get("baseCtx");
    const tenant = c.get("ctx").tenant;
    const now = base.ports.clock.now();
    const quotas = createService(RateLimitService, base);
    const key = quotaKey(tenant?.schoolId, user.id, "fetch");
    await quotas.consume(`${key}:minute`, { limit: 60, windowSeconds: 60 }, now);
    await quotas.consume(`${key}:day`, { limit: 1_000, windowSeconds: 86_400 }, now);
    const result = await createService(WebFetchService, c.get("ctx")).fetch(body);
    c.header("Cache-Control", "no-store");
    return c.json({ ...result, cached: false }, 200);
  });
