import { Hono } from "hono";

import type { AppEnv } from "./env";
import { health } from "./routes/health.routes";
import { studentPhotos } from "./routes/student-photo.routes";

export type AppVariables = {
  requestId: string;
};

export const app = new Hono<{ Bindings: AppEnv; Variables: AppVariables }>()
  .route("/", health)
  .route("/", studentPhotos);

export type AppType = typeof app;
