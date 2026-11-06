import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  createService,
  createServiceContext
} from "../../src/lib/server/services/context";
import { RateLimitService } from "../../src/lib/server/services/auth";
import { RateLimitError, ValidationError } from "../../src/lib/server/services/errors";
import { RATE_LIMIT_WINDOW_SECONDS } from "../../src/lib/server/services/auth/rate-limit-policy";
import { database, seedTwoSchools } from "../support/seed";

const db = database(env);
let service: RateLimitService;
const now = 1_700_000_000;
const key = "test:rate-limit:service";

beforeAll(async () => {
  await seedTwoSchools(db);
  service = createService(
    RateLimitService,
    createServiceContext({ DB: env.DB }, null)
  );
});

describe("rate limit service", () => {
  it("accepts attempts below the limit and rejects the sixth", async () => {
    await expect(service.assertAvailable(key, now)).resolves.toBeUndefined();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await service.recordFailure(key, now);
    }

    await expect(service.assertAvailable(key, now)).rejects.toBeInstanceOf(RateLimitError);
  });

  it("resets a key after a successful attempt", async () => {
    await service.reset(key);
    await expect(service.assertAvailable(key, now)).resolves.toBeUndefined();
  });

  it("consumes a fixed window and rejects over the limit", async () => {
    const consumeKey = "test:http:consume";
    await service.consume(consumeKey, { limit: 2, windowSeconds: 60 }, now);
    await service.consume(consumeKey, { limit: 2, windowSeconds: 60 }, now + 1);
    await expect(
      service.consume(consumeKey, { limit: 2, windowSeconds: 60 }, now + 2)
    ).rejects.toBeInstanceOf(RateLimitError);
    await expect(
      service.consume(consumeKey, { limit: 2, windowSeconds: 60 }, now + 61)
    ).resolves.toBeUndefined();
  });

  it("purges old windows and rejects a blank key", async () => {
    await service.recordFailure("test:purge-window", now);
    await expect(service.purge(now + RATE_LIMIT_WINDOW_SECONDS * 2)).resolves.toBeGreaterThanOrEqual(
      1
    );
    await expect(service.assertAvailable("", now)).rejects.toBeInstanceOf(ValidationError);
  });
});
