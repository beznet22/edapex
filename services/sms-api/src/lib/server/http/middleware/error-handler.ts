import type { ErrorHandler } from "hono";

import type { AppContext } from "../env";
import { mapError } from "../errors";

export const errorHandler: ErrorHandler<AppContext> = (error, c) => {
  const requestId = c.get("requestId") ?? "unknown";
  const mapping = mapError(error, requestId);
  console.error(
    JSON.stringify({
      requestId,
      error: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error)
    })
  );
  if (mapping.retryAfterSeconds !== undefined) {
    c.header("Retry-After", String(mapping.retryAfterSeconds));
  }
  return c.json(mapping.body, mapping.status);
};
