import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authEvents,
  authIdentities,
  authSessions,
  smParents,
  users
} from "../../src/lib/server/db/schema";
import { createServiceContext } from "../../src/lib/server/services/context";
import {
  ConflictError,
  DuplicateEmailService
} from "../../src/lib/server/services";
import type { ServiceContext } from "../../src/lib/server/services";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const NOW = 1_700_500_000;
const DUPLICATE = "dup@example.test";
const MERGEABLE = "merge@example.test";

let schools: readonly [SeededSchool, SeededSchool];
let scoped: ServiceContext;
let otherSchool: ServiceContext;

const clock = { now: () => NOW };
const service = () => new DuplicateEmailService(scoped);

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  await db.update(users).set({ email: DUPLICATE }).where(eq(users.id, schools[0].userId));
  await db.insert(users).values([
    { id: 130, fullName: "Duplicate A", email: DUPLICATE, schoolId: 1 },
    { id: 132, fullName: "Merge Keep", email: MERGEABLE, schoolId: 1 },
    { id: 133, fullName: "Merge Loser", email: MERGEABLE, schoolId: 1 },
    { id: 236, fullName: "Other School Dup", email: DUPLICATE, schoolId: 2 }
  ]);
  await db.insert(authSessions).values([
    {
      id: "dup-service-session-1",
      userId: schools[0].userId,
      tokenHash: "dup-service-token-1",
      expiresAt: NOW + 1000,
      deviceFingerprint: null,
      createdAt: NOW - 10
    },
    {
      id: "dup-service-session-2",
      userId: schools[0].userId,
      tokenHash: "dup-service-token-2",
      expiresAt: NOW + 1000,
      deviceFingerprint: null,
      createdAt: NOW - 5
    }
  ]);
  await db.insert(authIdentities).values({
    id: "dup-service-identity",
    userId: schools[0].userId,
    provider: "google",
    providerUserId: "google-dup-service",
    emailAtProvider: DUPLICATE,
    emailVerified: 1,
    createdAt: NOW
  });
  await db.insert(authEvents).values([
    { id: "dup-service-event-1", type: "login_succeeded", userId: schools[0].userId, createdAt: 100 },
    { id: "dup-service-event-2", type: "google_signin", userId: schools[0].userId, createdAt: 300 }
  ]);

  scoped = createServiceContext(env, tenantOf(schools[0]), { ports: { clock } });
  otherSchool = createServiceContext(env, tenantOf(schools[1]), { ports: { clock } });
});

describe("duplicate email service", () => {
  it("lists accounts with linkage personas, sessions, providers and last login", async () => {
    const groups = await service().list();
    const group = groups.find((entry) => entry.email === DUPLICATE);
    if (group === undefined) throw new Error("expected the duplicate group");

    const primary = group.accounts.find((account) => account.userId === schools[0].userId);
    expect(primary).toMatchObject({
      persona: "student",
      personas: ["student", "staff", "parent"],
      sessionCount: 2,
      providers: ["google"],
      lastLoginAt: 300,
      claimStatus: null
    });
    const secondary = group.accounts.find((account) => account.userId === 130);
    expect(secondary).toMatchObject({ persona: "unlinked", personas: [], sessionCount: 0 });
    expect(group.resolution).toBe("unresolved");
  });

  it("keeps the queue tenant-scoped", async () => {
    const groups = await new DuplicateEmailService(otherSchool).list();
    expect(groups).toEqual([]);
  });

  it("refuses to merge an account that still owns a persona record", async () => {
    await expect(
      service().merge({
        email: DUPLICATE,
        keepUserId: 130,
        mergeUserIds: [schools[0].userId]
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("merges identities and sessions, then deletes the loser", async () => {
    await db.insert(authIdentities).values({
      id: "merge-service-identity",
      userId: 133,
      provider: "google",
      providerUserId: "google-merge-service",
      emailAtProvider: MERGEABLE,
      emailVerified: 1,
      createdAt: NOW
    });
    await service().merge({
      email: MERGEABLE,
      keepUserId: 132,
      mergeUserIds: [133]
    });

    const [identity] = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(eq(authIdentities.id, "merge-service-identity"));
    expect(identity?.userId).toBe(132);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, 133))).toEqual([]);

    const events = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "account_merge"));
    expect(events).toHaveLength(1);
  });

  it("exports the queue as CSV with the resolution state", async () => {
    const csv = await service().exportCsv();
    const [header, first] = csv.split("\n");
    expect(header).toContain("email,user_id,full_name");
    expect(header).toContain("resolution");
    expect(first).toContain(DUPLICATE);
    expect(first).toContain("unresolved");
  });

  it("reassigns the address, clears it elsewhere and mirrors the parent persona", async () => {
    await service().reassign({ email: DUPLICATE, targetUserId: schools[0].userId });

    const [target] = await db
      .select({ email: users.email, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, schools[0].userId));
    expect(target).toEqual({ email: DUPLICATE, claimStatus: "pending" });

    const [cleared] = await db
      .select({ email: users.email, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 130));
    expect(cleared).toEqual({ email: null, claimStatus: "pending" });

    const [parent] = await db
      .select({ guardiansEmail: smParents.guardiansEmail })
      .from(smParents)
      .where(eq(smParents.userId, schools[0].userId));
    expect(parent?.guardiansEmail).toBe(DUPLICATE);

    const events = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "account_reassign"));
    expect(events).toHaveLength(1);
  });

  it("flags an account and reports it in the resolution", async () => {
    await service().flag(130);
    const [row] = await db
      .select({ claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 130));
    expect(row?.claimStatus).toBe("flagged");

    const events = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "account_flagged"));
    expect(events).toHaveLength(1);
  });
});
