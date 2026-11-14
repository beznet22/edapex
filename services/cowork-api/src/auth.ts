import type { Context, Next } from "hono";

import type { AppContext } from "./env";
import { apiError } from "./schema";

/**
 * Resolves the caller from the shared `__Host-` session cookie.
 *
 * `sms-api` owns sessions and the school database. This Worker asks it over a
 * service binding rather than reading the session itself, because the cookie is
 * host-bound (no `Domain` attribute) and both Workers are served on the same
 * host — so the browser sends it here too, but only `sms-api` can validate it.
 *
 * Delegating means this Worker never holds a session table, a session secret or
 * the school database.
 */
export async function authenticate(
  context: Context<AppContext>,
  next: Next
): Promise<void | Response> {
  const cookie = context.req.header("cookie");
  if (cookie === undefined || !cookie.includes("edapex_session")) {
    return context.json(apiError("Sign in to continue.", "unauthorized"), 401);
  }

  const response = await context.env.SMS_API.fetch(
    new URL("/api/v1/me", context.env.API_ORIGIN),
    {
      method: "GET",
      headers: { cookie, accept: "application/json" }
    }
  );

  if (!response.ok) {
    return context.json(apiError("Sign in to continue.", "unauthorized"), 401);
  }

  const body = (await response.json()) as { user?: { id?: unknown } };
  const id = body.user?.id;
  if (typeof id !== "number" && typeof id !== "string") {
    return context.json(apiError("Sign in to continue.", "unauthorized"), 401);
  }

  context.set("userId", String(id));
  await next();
}
