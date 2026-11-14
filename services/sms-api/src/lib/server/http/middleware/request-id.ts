import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";

export const requestId: MiddlewareHandler<AppContext> = async (c, next) => {
  const id = crypto.randomUUID();
  const forwarded = c.req.header("x-forwarded-for");
  c.set("requestId", id);
  c.set("ip", c.req.header("cf-connecting-ip") ?? forwarded?.split(",")[0]?.trim() ?? null);
  c.set("userAgent", c.req.header("user-agent") ?? null);
  c.header("X-Request-Id", id);
  await next();
};
