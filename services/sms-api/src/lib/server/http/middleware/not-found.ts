import type { NotFoundHandler } from "hono";

import type { AppContext } from "../env";

export const notFound: NotFoundHandler<AppContext> = (c) =>
  c.json(
    {
      error: "NOT_FOUND",
      message: "Route not found",
      requestId: c.get("requestId") ?? ""
    },
    404
  );
