import { getCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

import { createService, RateLimitService, sha256Hex } from "../../services";
import { API_RATE_LIMITS } from "../../services/auth/rate-limit-policy";
import type { AppContext } from "../env";
import { SESSION_COOKIE } from "./auth";

type PolicyName = keyof typeof API_RATE_LIMITS;

interface Policy {
  readonly name: PolicyName;
  readonly rule: (typeof API_RATE_LIMITS)[PolicyName];
}

const policyFor = (path: string): Policy => {
  if (path.startsWith("/api/v1/auth/")) {
    return { name: "auth", rule: API_RATE_LIMITS.auth };
  }
  if (path.startsWith("/uploads/") || path.startsWith("/r/")) {
    return { name: "public", rule: API_RATE_LIMITS.public };
  }
  return { name: "general", rule: API_RATE_LIMITS.general };
};

const identityOf = async (c: Parameters<MiddlewareHandler<AppContext>>[0]): Promise<string> => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token !== undefined && token.length > 0) {
    return `session:${await sha256Hex(token)}`;
  }
  return `ip:${c.get("ip") ?? "unknown"}`;
};

export const rateLimit: MiddlewareHandler<AppContext> = async (c, next) => {
  const policy = policyFor(new URL(c.req.url).pathname);
  const key = `http:${policy.name}:${await identityOf(c)}`;
  await createService(RateLimitService, c.get("baseCtx")).consume(key, policy.rule);
  await next();
};
