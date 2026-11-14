import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authEvents, users } from "../../src/lib/server/db/schema";
import { createServiceContext } from "../../src/lib/server/services/context";
import {
  ClaimResetService,
  ConflictError,
  sha256Hex
} from "../../src/lib/server/services";
import type { ServiceContext } from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const NOW = 1_700_600_000;
const SHARED = "reset-shared-secret";
let actor = 0;

let schools: readonly [SeededSchool, SeededSchool];
let scoped: ServiceContext;
let disabled: ServiceContext;

const clock = { now: () => NOW };

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  actor = schools[0].userId;
  const digest = await sha256Hex(SHARED);
  await db.insert(users).values([
    { id: 134, fullName: "Reset One", email: "reset-one@example.test", schoolId: 1 },
    { id: 135, fullName: "Reset Two", email: "reset-two@example.test", schoolId: 1 },
    { id: 136, fullName: "No Email", email: null, password: "untouched", schoolId: 1 },
    { id: 137, fullName: "Already Claimed", email: "claimed@example.test", password: null, claimStatus: "claimed", schoolId: 1 }
  ]);

  const authConfig = {
    claimEnabled: true,
    claimDigest: digest,
    claimLinkEnabled: true,
    cookieSecret: "reset-cookie-secret",
    googleConfigured: true,
    postLoginRedirect: "/",
    appOrigin: "https://app.example.test"
  };
  scoped = createServiceContext(env, tenantOf(schools[0]), {
    ports: { clock, authConfig }
  });
  disabled = createServiceContext(env, tenantOf(schools[0]), {
    ports: { clock, authConfig: { ...authConfig, claimEnabled: false, claimDigest: null } }
  });
});

describe("claim reset service", () => {
  it("writes the shared digest to every claimable account in the school", async () => {
    const digest = await sha256Hex(SHARED);
    const result = await new ClaimResetService(scoped).reset({ actorUserId: actor });

    expect(result).toEqual({
      schoolId: 1,
      actorUserId: actor,
      count: 3,
      pending: 3
    });

    for (const id of [schools[0].userId, 134, 135]) {
      const [row] = await db
        .select({ password: users.password, claimStatus: users.claimStatus })
        .from(users)
        .where(eq(users.id, id));
      expect(row).toEqual({ password: digest, claimStatus: "pending" });
    }

    const [noEmail] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 136));
    expect(noEmail).toEqual({ password: "untouched", claimStatus: null });

    const [claimed] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 137));
    expect(claimed).toEqual({ password: null, claimStatus: "claimed" });
  });

  it("is idempotent and writes one audit row per run", async () => {
    const second = await new ClaimResetService(scoped).reset({ actorUserId: actor });
    expect(second.count).toBe(3);

    const events = await db
      .select({ metadata: authEvents.metadata })
      .from(authEvents)
      .where(eq(authEvents.type, "password_reset_bulk"));
    expect(events).toHaveLength(2);
    expect(JSON.parse(events[0]?.metadata ?? "{}")).toMatchObject({
      actorUserId: actor,
      schoolId: 1,
      count: 3
    });
  });

  it("refuses to run when the claim flow is disabled", async () => {
    await expect(
      new ClaimResetService(disabled).reset({ actorUserId: actor })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("validates the actor id", async () => {
    await expect(
      new ClaimResetService(scoped).reset({ actorUserId: 0 })
    ).rejects.toBeInstanceOf(Error);
  });
});
