import { Hono } from "hono";

import { authenticate } from "./auth";
import type { AppContext } from "./env";
import { agentSync } from "./routes/agent-sync.routes";
import { apiError } from "./schema";

export function createApp() {
  const app = new Hono<AppContext>();

  app.get("/health", (context) =>
    context.json({ status: "ok", service: "cowork-api" }, 200)
  );

  app.use("/api/v1/agent/*", authenticate);
  app.route("/api/v1/agent", agentSync);

  app.notFound((context) => context.json(apiError("Not found.", "invalid_request"), 404));

  app.onError((error, context) => {
    // Never echo the error message: it can carry SQL fragments or binding names.
    console.error("cowork-api error", error);
    return context.json(apiError("Something went wrong.", "internal"), 500);
  });

  return app;
}

export const app = createApp();
export type AppType = typeof app;
