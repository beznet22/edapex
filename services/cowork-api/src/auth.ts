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

/**
 * Calls `sms-api`, over the service binding where there is one.
 *
 * In production `SMS_API` is a private binding: traffic never leaves Cloudflare and the API
 * has no public hostname to reach. Locally, `wrangler dev` runs each Worker as its own
 * process and does not wire bindings between them unless they start in the same session —
 * so `context.env.SMS_API` is undefined and every authenticated request fails with a 401 that
 * looks like a session problem.
 *
 * The fallback is a plain `fetch` to `API_ORIGIN`, which `.dev.vars` points at
 * `http://127.0.0.1:8787`. Gated on the binding being absent rather than on an environment
 * name: if production ever lost its binding, falling back to a public URL would be a security
 * regression, so the fallback requires a loopback origin.
 */
async function callSmsApi(
  context: Context<AppContext>,
  path: string,
  init: RequestInit
): Promise<Response> {
  const url = new URL(path, context.env.API_ORIGIN);
  const binding = context.env.SMS_API;

  if (binding !== undefined && typeof binding.fetch === "function") {
    return await binding.fetch(new Request(url, init));
  }

  /*
   * No binding. Only allowed against a loopback origin: a missing binding in production must
   * fail loudly rather than silently route a session check over the public internet.
   */
  if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") {
    throw new Error(
      "SMS_API binding is missing and API_ORIGIN is not loopback; refusing to call it directly."
    );
  }
  return await fetch(url, init);
}

export async function authenticate(
  context: Context<AppContext>,
  next: Next
): Promise<void | Response> {
  const cookie = context.req.header("cookie");
  if (cookie === undefined || !cookie.includes("edapex_session")) {
    return context.json(apiError("Sign in to continue.", "unauthorized"), 401);
  }

  const response = await callSmsApi(context, "/api/v1/me", {
    method: "GET",
    headers: { cookie, accept: "application/json" }
  });

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
