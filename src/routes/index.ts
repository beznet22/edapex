/**
 * ==========================================
 * Layer: ROUTES mapping
 * Protocol: @backend-dev-guidelines
 * ==========================================
 * Purpose:
 *   Hono.js route definitions mapping API endpoints to Controller methods.
 *   This layer only registers the route, applies middleware, and points to the
 *   controller endpoint.
 *
 * Rules:
 *   - NO anonymous arrow functions containing business logic.
 *   - ALL endpoints must be wrapped in `asyncErrorWrapper`.
 *   - Filename convention: `camelCaseRoutes.ts`.
 */

import { Hono } from "hono";
import { syncRoutes } from "./syncRoutes";
import { aiRoutes } from "./aiRoutes";
import { classroomRoutes } from "./classroomRoutes";

const routes = new Hono();

/**
 * Mount all domain routes
 */
routes.route("/sync", syncRoutes);
routes.route("/ai", aiRoutes);
routes.route("/classroom", classroomRoutes);

export { routes };
