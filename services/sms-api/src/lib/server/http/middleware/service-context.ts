import type { MiddlewareHandler } from "hono";

import type { createServiceContext } from "../../services/context";
import type { AppContext } from "../env";

export const createServiceContextMiddleware = (
  createContext: typeof createServiceContext
): MiddlewareHandler<AppContext> => async (c, next) => {
  const ctx = createContext(c.env, null);
  c.set("baseCtx", ctx);
  c.set("ctx", ctx);
  await next();
};
