import { Hono } from "hono";

import { createServiceContext } from "../services/context";
import type { AppContext } from "./env";
import { auth, requireAuth } from "./middleware/auth";
import { bodyLimit } from "./middleware/body-limit";
import { contentNegotiation } from "./middleware/content-negotiation";
import { cors } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { logger } from "./middleware/logger";
import { notFound } from "./middleware/not-found";
import { rateLimit } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { createServiceContextMiddleware } from "./middleware/service-context";
import { createTenantMiddleware } from "./middleware/tenant";
import { createProtectedRoutes, publicAuthRoutes } from "./routes";
import { authClaim } from "./routes/auth-claim.routes";
import { authClaimLink } from "./routes/auth-claim-link.routes";
import { authCode } from "./routes/auth-code.routes";
import { authGoogle } from "./routes/auth-google.routes";
import { authMagicLink } from "./routes/auth-magic-link.routes";
import { health } from "./routes/health.routes";
import { publicDocument } from "./routes/public-document.routes";
import { studentPhotos } from "./routes/student-photo.routes";

export interface AppDependencies {
  readonly createContext?: typeof createServiceContext;
}

export function createApp(deps: AppDependencies = {}) {
  const createContext = deps.createContext ?? createServiceContext;

  const protectedApp = new Hono<AppContext>()
    .use("*", auth)
    .use("*", requireAuth)
    .route("/", createProtectedRoutes(createTenantMiddleware(createContext)));

  const app = new Hono<AppContext>()
    .use("*", requestId)
    .use("*", logger)
    .use("*", cors)
    .use("*", contentNegotiation)
    .use("*", bodyLimit)
    .route("/", health)
    .use("*", createServiceContextMiddleware(createContext))
    .use("*", rateLimit)
    .route("/", studentPhotos)
    .route("/", publicDocument)
    .route("/api/v1/auth", publicAuthRoutes)
    .route("/api/v1/auth", authClaim)
    .route("/api/v1/auth", authClaimLink)
    .route("/api/v1/auth", authGoogle)
    .route("/api/v1/auth", authMagicLink)
    .route("/api/v1/auth", authCode)
    .route("/api/v1", protectedApp);

  app.onError(errorHandler);
  app.notFound(notFound);
  return app;
}

export const app = createApp();
export type AppType = typeof app;
