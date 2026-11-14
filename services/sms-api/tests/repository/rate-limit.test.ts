import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";

import { createUnscopedContext } from "../../src/lib/server/repository/base/repository-context";
import type { UnscopedRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  deleteRateLimitsBefore,
  incrementRateLimit,
  readRateLimit
} from "../../src/lib/server/repository";

let ctx: UnscopedRepositoryContext;

beforeEach(() => {
  ctx = createUnscopedContext(env);
});

describe("auth rate limit repository", () => {
  it("stores attempts in D1 and increments atomically", async () => {
    const key = "login:school-1:user@example.test";
    const windowStart = 1_700_000_000;

    await expect(readRateLimit(ctx, key, windowStart)).resolves.toBe(0);
    await expect(incrementRateLimit(ctx, key, windowStart)).resolves.toBe(1);
    await expect(incrementRateLimit(ctx, key, windowStart)).resolves.toBe(2);
    await expect(readRateLimit(ctx, key, windowStart)).resolves.toBe(2);
  });

  it("keeps windows independent", async () => {
    const key = "login:school-1:other@example.test";
    await incrementRateLimit(ctx, key, 1);
    await incrementRateLimit(ctx, key, 2);
    await incrementRateLimit(ctx, key, 2);

    await expect(readRateLimit(ctx, key, 1)).resolves.toBe(1);
    await expect(readRateLimit(ctx, key, 2)).resolves.toBe(2);
  });

  it("deletes only windows older than the cutoff", async () => {
    const key = "login:school-1:cleanup@example.test";
    await incrementRateLimit(ctx, key, 10);
    await incrementRateLimit(ctx, key, 20);

    await expect(deleteRateLimitsBefore(ctx, 15)).resolves.toBeGreaterThanOrEqual(1);
    await expect(readRateLimit(ctx, key, 10)).resolves.toBe(0);
    await expect(readRateLimit(ctx, key, 20)).resolves.toBe(1);
  });
});
