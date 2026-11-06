import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { RateLimitError } from "../errors";

export const MAX_LOGIN_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

export const windowStart = (now: number): number =>
  now - (now % RATE_LIMIT_WINDOW_SECONDS);

export const retryAfterSeconds = (now: number): number =>
  RATE_LIMIT_WINDOW_SECONDS - (now % RATE_LIMIT_WINDOW_SECONDS);

export async function assertNotLimited(
  ctx: ServiceContext,
  key: string,
  now: number
): Promise<void> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  const count = await ctx.repos.accounts.readRateLimit(unscoped, key, windowStart(now));
  if (count >= MAX_LOGIN_ATTEMPTS) {
    throw new RateLimitError(retryAfterSeconds(now));
  }
}

export async function recordFailure(
  ctx: ServiceContext,
  key: string,
  now: number
): Promise<void> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  await ctx.repos.accounts.incrementRateLimit(unscoped, key, windowStart(now));
}

export async function resetLimit(ctx: ServiceContext, key: string): Promise<void> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  await ctx.repos.accounts.deleteRateLimit(unscoped, key);
}

export interface RateLimitRule {
  readonly limit: number;
  readonly windowSeconds: number;
}

export const API_RATE_LIMITS = {
  auth: { limit: 5, windowSeconds: 60 },
  public: { limit: 30, windowSeconds: 60 },
  general: { limit: 120, windowSeconds: 60 }
} as const satisfies Record<string, RateLimitRule>;

export async function consumeLimit(
  ctx: ServiceContext,
  key: string,
  rule: RateLimitRule,
  now: number
): Promise<void> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  const start = now - (now % rule.windowSeconds);
  const count = await ctx.repos.accounts.incrementRateLimit(unscoped, key, start);
  if (count > rule.limit) {
    throw new RateLimitError(rule.windowSeconds - (now % rule.windowSeconds));
  }
}
