import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";

/**
 * Route modules never read request headers directly (`check:http` bans it).
 * The two negotiated shapes are HTML redirects and CSV downloads.
 */
export const contentNegotiation: MiddlewareHandler<AppContext> = async (c, next) => {
  const accept = c.req.raw.headers.get("accept") ?? "";
  c.set("wantsHtml", accept.includes("text/html"));
  c.set("wantsCsv", accept.includes("text/csv"));
  await next();
};
