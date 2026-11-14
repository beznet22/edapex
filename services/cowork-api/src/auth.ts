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
 * the school database. The identity it returns is the minimum needed to resolve a
 * capability role, and deliberately carries no school scope requirement, so a
 * tenant with no school still boots (spec 10, tier 1).
 */

export interface ResolvedIdentity {
  readonly userId: string;
  readonly isAdmin: boolean;
  readonly staffId: number | null;
  /**
   * Not reported by the session DTO. A separate resolution would be a school
   * lookup this Worker must not perform, so this stays false — which resolves to
   * the student manifest, the direction that grants the fewest tools.
   */
  readonly isParent: boolean;
  /** Null for a platform-only tenant. Never used to resolve capabilities. */
  readonly schoolId: number | null;
}

interface SessionPayload {
  readonly user?: {
    readonly id?: unknown;
    readonly isAdmin?: unknown;
    readonly staffId?: unknown;
    readonly schoolId?: unknown;
  };
}

function toIdentity(payload: SessionPayload): ResolvedIdentity | null {
  const user = payload.user;
  if (user === undefined) return null;
  const id = user.id;
  if (typeof id !== "number" && typeof id !== "string") return null;

  return {
    userId: String(id),
    isAdmin: user.isAdmin === true,
    staffId: typeof user.staffId === "number" ? user.staffId : null,
    isParent: false,
    schoolId: typeof user.schoolId === "number" ? user.schoolId : null
  };
}

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

  const identity = toIdentity((await response.json()) as SessionPayload);
  if (identity === null) {
    return context.json(apiError("Sign in to continue.", "unauthorized"), 401);
  }

  context.set("userId", identity.userId);
  context.set("identity", identity);
  await next();
}
