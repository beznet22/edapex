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
