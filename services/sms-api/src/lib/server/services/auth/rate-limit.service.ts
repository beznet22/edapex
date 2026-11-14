import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { ValidationError } from "../errors";
import {
  assertNotLimited,
  consumeLimit,
  recordFailure,
  resetLimit
} from "./rate-limit-policy";
import type { RateLimitRule } from "./rate-limit-policy";

export class RateLimitService {
  constructor(private readonly ctx: ServiceContext) {}

  async assertAvailable(key: string, now: number = this.ctx.ports.clock.now()): Promise<void> {
    if (key.trim().length === 0) {
      throw new ValidationError("A rate-limit key is required", "key");
    }
    await assertNotLimited(this.ctx, key, now);
  }

  async recordFailure(key: string, now: number = this.ctx.ports.clock.now()): Promise<void> {
    if (key.trim().length === 0) {
      throw new ValidationError("A rate-limit key is required", "key");
    }
    await recordFailure(this.ctx, key, now);
  }

  async reset(key: string): Promise<void> {
    if (key.trim().length === 0) {
      throw new ValidationError("A rate-limit key is required", "key");
    }
    await resetLimit(this.ctx, key);
  }

  async consume(
    key: string,
    rule: RateLimitRule,
    now: number = this.ctx.ports.clock.now()
  ): Promise<void> {
    if (key.trim().length === 0) {
      throw new ValidationError("A rate-limit key is required", "key");
    }
    if (!Number.isInteger(rule.limit) || rule.limit <= 0) {
      throw new ValidationError("A positive rate limit is required", "limit");
    }
    if (!Number.isInteger(rule.windowSeconds) || rule.windowSeconds <= 0) {
      throw new ValidationError("A positive rate-limit window is required", "windowSeconds");
    }
    await consumeLimit(this.ctx, key, rule, now);
  }

  async purge(before: number): Promise<number> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    return this.ctx.repos.accounts.deleteRateLimitsBefore(unscoped, before);
  }
}
