import type { MiddlewareHandler } from "hono";

import type { AppContext } from "../env";

export const parseOrigins = (value: string | undefined): readonly string[] =>
  (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const cors: MiddlewareHandler<AppContext> = async (c, next) => {
  const origin = c.req.header("origin");
  const allowed = origin !== undefined && parseOrigins(c.env.CORS_ORIGINS).includes(origin);
  c.header("Vary", "Origin");
  if (allowed) {
    c.header("Access-Control-Allow-Origin", origin);
    c.header("Access-Control-Allow-Credentials", "true");
    c.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    c.header(
      "Access-Control-Allow-Headers",
      "Content-Type,Authorization,X-Academic-Id,X-Class-Id,X-Section-Id"
    );
    c.header("Access-Control-Max-Age", "600");
  }
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
};
