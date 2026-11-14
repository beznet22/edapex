import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authEvents } from "../../src/lib/server/db/schema";
import { createUnscopedContext } from "../../src/lib/server/repository/base/repository-context";
import { createAuthEvent } from "../../src/lib/server/repository";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const ctx = createUnscopedContext(env);
let schools: readonly [SeededSchool, SeededSchool];

beforeAll(async () => {
  schools = await seedTwoSchools(db);
});

describe("auth event repository", () => {
  it("writes every attempt and leaves the row readable for audit", async () => {
    await createAuthEvent(ctx, {
      id: "event-1",
      type: "login_failed",
      email: "user@example.test",
      ip: "203.0.113.10",
      userAgent: "vitest",
      createdAt: 1_700_000_000
    });

    const rows = await db
      .select()
      .from(authEvents)
      .where(eq(authEvents.id, "event-1"));

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: "login_failed",
      email: "user@example.test",
      userId: null
    });
  });

  it("accepts a linked user and a null email", async () => {
    await createAuthEvent(ctx, {
      id: "event-2",
      type: "login_succeeded",
      userId: schools[0].userId,
      email: null,
      createdAt: 1_700_000_001
    });

    const rows = await db
      .select({ type: authEvents.type, userId: authEvents.userId })
      .from(authEvents)
      .where(eq(authEvents.id, "event-2"));

    expect(rows[0]).toEqual({ type: "login_succeeded", userId: schools[0].userId });
  });
});
