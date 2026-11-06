import { asc, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authEvents,
  authIdentities,
  authSessions,
  smParents,
  users
} from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import {
  flagAccountForReview,
  listAccountsForEmails,
  listDuplicateEmailGroups,
  listIdentityProviders,
  listLastLogins,
  listPersonaLinks,
  listSessionCounts,
  mergeAccounts,
  reassignEmail
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
let schools: readonly [SeededSchool, SeededSchool];

const DUPLICATE = "dup@example.test";

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  await db.insert(users).values([
    { id: 130, fullName: "Duplicate A", email: DUPLICATE, schoolId: 1 },
    { id: 131, fullName: "Duplicate B", email: DUPLICATE, schoolId: 1 },
    { id: 232, fullName: "Other school", email: DUPLICATE, schoolId: 2 }
  ]);
});

describe("duplicate email repository", () => {
  it("finds duplicate groups only inside the tenant", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await expect(listDuplicateEmailGroups(scoped)).resolves.toEqual([
      { email: DUPLICATE, accountCount: 2 }
    ]);

    const other = createRepositoryContext(db, tenantOf(schools[1]));
    await expect(listDuplicateEmailGroups(other)).resolves.toEqual([]);
  });

  it("returns every account for the address with its claim state", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    const rows = await listAccountsForEmails(scoped, [DUPLICATE]);
    expect(rows.map((row) => row.userId)).toEqual([130, 131]);
    expect(rows[0]).toMatchObject({
      email: DUPLICATE,
      activeStatus: 1,
      claimStatus: null,
      isAdministrator: "no"
    });
  });

  it("derives personas from linkage, not usertype", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await expect(listPersonaLinks(scoped, [schools[0].userId])).resolves.toEqual([
      { userId: schools[0].userId, persona: "student" },
      { userId: schools[0].userId, persona: "staff" },
      { userId: schools[0].userId, persona: "parent" }
    ]);
    await expect(listPersonaLinks(scoped, [130])).resolves.toEqual([]);
  });

  it("reports active sessions, linked providers and the last login", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    const userId = schools[0].userId;
    await db.insert(authSessions).values([
      {
        id: "dup-session-1",
        userId,
        tokenHash: "dup-token-1",
        expiresAt: 400,
        deviceFingerprint: null,
        createdAt: 100
      },
      {
        id: "dup-session-2",
        userId,
        tokenHash: "dup-token-2",
        expiresAt: 400,
        deviceFingerprint: null,
        createdAt: 110
      },
      {
        id: "dup-session-3",
        userId,
        tokenHash: "dup-token-3",
        expiresAt: 400,
        deviceFingerprint: null,
        createdAt: 120,
        revokedAt: 130
      },
      {
        id: "dup-session-4",
        userId,
        tokenHash: "dup-token-4",
        expiresAt: 150,
        deviceFingerprint: null,
        createdAt: 140
      }
    ]);
    await db.insert(authIdentities).values({
      id: "dup-identity",
      userId,
      provider: "google",
      providerUserId: "google-dup",
      emailAtProvider: DUPLICATE,
      emailVerified: 1,
      createdAt: 100
    });
    await db.insert(authEvents).values([
      { id: "dup-event-1", type: "login_succeeded", userId, createdAt: 100 },
      { id: "dup-event-2", type: "login_succeeded", userId, createdAt: 300 },
      { id: "dup-event-3", type: "google_signin", userId: 130, createdAt: 500 }
    ]);

    await expect(listSessionCounts(scoped, [userId, 130], 200)).resolves.toEqual([
      { userId, total: 2 }
    ]);
    await expect(listIdentityProviders(scoped, [userId])).resolves.toEqual([
      { userId, provider: "google" }
    ]);

    const lastLogins = await listLastLogins(scoped, [userId, 130]);
    expect([...lastLogins].sort((left, right) => left.userId - right.userId)).toEqual([
      { userId, lastLoginAt: 300 },
      { userId: 130, lastLoginAt: 500 }
    ]);
  });

  it("reassigns the address, clears the others and mirrors the parent persona", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await reassignEmail(scoped, {
      targetUserId: schools[0].userId,
      otherUserIds: [130, 131],
      email: DUPLICATE
    });

    const rows = await db
      .select({ id: users.id, email: users.email, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.schoolId, 1))
      .orderBy(asc(users.id));
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(schools[0].userId)).toMatchObject({
      email: DUPLICATE,
      claimStatus: "pending"
    });
    expect(byId.get(130)).toMatchObject({ email: null, claimStatus: "pending" });
    expect(byId.get(131)).toMatchObject({ email: null, claimStatus: "pending" });

    const [parent] = await db
      .select({ guardiansEmail: smParents.guardiansEmail })
      .from(smParents)
      .where(eq(smParents.userId, schools[0].userId));
    expect(parent?.guardiansEmail).toBe(DUPLICATE);
  });

  it("merges identities and sessions, then deletes the loser", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await db.insert(authIdentities).values({
      id: "merge-identity",
      userId: 130,
      provider: "google",
      providerUserId: "google-merge",
      emailAtProvider: DUPLICATE,
      emailVerified: 1,
      createdAt: 100
    });
    await db.insert(authSessions).values([
      {
        id: "merge-session-loser",
        userId: 130,
        tokenHash: "merge-token-loser",
        expiresAt: 400,
        deviceFingerprint: null,
        createdAt: 100
      },
      {
        id: "merge-session-keep",
        userId: 131,
        tokenHash: "merge-token-keep",
        expiresAt: 400,
        deviceFingerprint: null,
        createdAt: 100
      }
    ]);

    await mergeAccounts(scoped, { keepUserId: 131, loserUserIds: [130] });

    const [identity] = await db
      .select({ userId: authIdentities.userId })
      .from(authIdentities)
      .where(eq(authIdentities.id, "merge-identity"));
    expect(identity?.userId).toBe(131);

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, 131));
    expect(sessions).toEqual([]);

    const losers = await db.select({ id: users.id }).from(users).where(eq(users.id, 130));
    expect(losers).toEqual([]);

    const [keep] = await db
      .select({ claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 131));
    expect(keep?.claimStatus).toBe("pending");
  });

  it("flags an account and leaves another school's account untouched", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await flagAccountForReview(scoped, 131);
    const [flagged] = await db
      .select({ claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 131));
    expect(flagged?.claimStatus).toBe("flagged");

    await reassignEmail(scoped, {
      targetUserId: 232,
      otherUserIds: [],
      email: "should-not-apply@example.test"
    });
    const [otherSchool] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, 232));
    expect(otherSchool?.email).toBe(DUPLICATE);
  });
});
