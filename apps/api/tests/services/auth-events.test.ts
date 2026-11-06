import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { authEvents } from "../../src/lib/server/db/schema";
import { database } from "../support/seed";
import { createServiceContext } from "../../src/lib/server/services/context";
import { emitAuthEvent } from "../../src/lib/server/services";

const db = database(env);
const ctx = createServiceContext(env, null);

describe("auth events", () => {
  it("writes the type, actor context and serialised metadata", async () => {
    await emitAuthEvent(
      ctx,
      {
        type: "password_reset_bulk",
        userId: null,
        email: null,
        ip: "203.0.113.5",
        userAgent: "vitest",
        metadata: { actorUserId: 7, schoolId: 1, count: 1610 }
      },
      1_700_000_000
    );

    const [row] = await db
      .select()
      .from(authEvents)
      .where(eq(authEvents.type, "password_reset_bulk"));
    expect(row?.ip).toBe("203.0.113.5");
    expect(row?.metadata).toBe('{"actorUserId":7,"schoolId":1,"count":1610}');
    expect(row?.createdAt).toBe(1_700_000_000);
  });

  it("stores null metadata when none is supplied", async () => {
    await emitAuthEvent(ctx, { type: "claim_attempt", email: "a@example.test" }, 1_700_000_001);
    const [row] = await db
      .select({ metadata: authEvents.metadata })
      .from(authEvents)
      .where(eq(authEvents.type, "claim_attempt"));
    expect(row?.metadata).toBeNull();
  });
});
