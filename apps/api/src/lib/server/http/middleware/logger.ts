import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";

const write = (c: Parameters<MiddlewareHandler<AppContext>>[0], status: number, startedAt: number): void => {
  console.log(
    JSON.stringify({
      requestId: c.get("requestId"),
      method: c.req.method,
      path: new URL(c.req.url).pathname,
      status,
      durationMs: Date.now() - startedAt
    })
  );
};

export const logger: MiddlewareHandler<AppContext> = async (c, next) => {
  const startedAt = Date.now();
  try {
    await next();
  } catch (error) {
    write(c, 500, startedAt);
    throw error;
  }
  write(c, c.res.status, startedAt);
};
