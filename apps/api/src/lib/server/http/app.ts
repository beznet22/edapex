import { Hono } from "hono";

import { health } from "./routes/health.routes";

export type AppVariables = {
  requestId: string;
};

export const app = new Hono<{ Variables: AppVariables }>().route("/", health);

export type AppType = typeof app;
