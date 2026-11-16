import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";

/**
 * Surfaces the two caller headers the model passthrough forwards.
 *
 * Routes may not read headers directly — the http rule engine enforces it, and
 * the reason is real: a header read inline bypasses the place where validation
 * and provenance live. Resolving them here keeps the route a pure relay of
 * `c.get(...)` values, the same shape `contentNegotiation` uses for `accept`.
 *
 * Both are optional. A tenant with no school sends no school id and must still
 * reach a model; a caller that states no provider gets the router's default.
 */
export const agentModelHeaders: MiddlewareHandler<AppContext> = async (c, next) => {
  const provider = c.req.header("x-edapex-provider");
  const accept = c.req.header("accept");

  c.set("providerSelector", provider === undefined ? null : provider);
  c.set(
    "acceptHeader",
    accept === undefined || accept.trim().length === 0 ? "text/event-stream" : accept
  );

  await next();
};
