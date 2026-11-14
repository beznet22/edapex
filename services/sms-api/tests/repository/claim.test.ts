import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authIdentities, authSessions, users } from "../../src/lib/server/db/schema";
import { createRepositoryContext } from "../../src/lib/server/repository/base/repository-context";
import { createUnscopedContext } from "../../src/lib/server/repository/base/repository-context";
import {
  completeClaimLink,
  countClaimStates,
  resetClaimDigests,
  setClaimStatus
} from "../../src/lib/server/repository";
import { database, seedTwoSchools, tenantOf } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const unscoped = createUnscopedContext(env);
let schools: readonly [SeededSchool, SeededSchool];

const session = (userId: number, suffix: string, createdAt: number) => ({
  id: `session-${suffix}`,
  userId,
  tokenHash: `hash-${suffix}`,
  expiresAt: createdAt + 3600,
  deviceFingerprint: null,
  createdAt
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  await db.update(users).set({ password: "existing-digest" }).where(eq(users.id, schools[0].userId));
});

describe("claim repository", () => {
  it("links the identity, retires the password and replaces every session atomically", async () => {
    const now = 1_700_000_000;
    await db.insert(authSessions).values(session(schools[0].userId, "old", now - 60));

    await completeClaimLink(unscoped, {
      userId: schools[0].userId,
      identity: {
        id: "identity-1",
        userId: schools[0].userId,
        provider: "google",
        providerUserId: "google-sub-1",
        emailAtProvider: "user1@example.test",
        emailVerified: 1,
        createdAt: now
      },
      session: session(schools[0].userId, "fresh", now),
      email: "user1@example.test",
      now
    });

    const [user] = await db
      .select({
        password: users.password,
        claimStatus: users.claimStatus,
        emailVerifiedAt: users.emailVerifiedAt
      })
      .from(users)
      .where(eq(users.id, schools[0].userId));
    expect(user).toEqual({ password: null, claimStatus: "claimed", emailVerifiedAt: now });

    const identities = await db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.userId, schools[0].userId));
    expect(identities).toEqual([{ id: "identity-1" }]);

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, schools[0].userId));
    expect(sessions).toEqual([{ id: "session-fresh" }]);
  });

  it("leaves no partial claim when the identity insert fails", async () => {
    await db.update(users).set({ password: "unchanged-digest" }).where(eq(users.id, schools[1].userId));
    const now = 1_700_000_100;

    await expect(
      completeClaimLink(unscoped, {
        userId: schools[1].userId,
        identity: {
          id: "identity-duplicate",
          userId: schools[1].userId,
          provider: "google",
          providerUserId: "google-sub-1",
          emailAtProvider: "user2@example.test",
          emailVerified: 1,
          createdAt: now
        },
        session: session(schools[1].userId, "should-not-exist", now),
        email: "user2@example.test",
        now
      })
    ).rejects.toThrow();

    const [user] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, schools[1].userId));
    expect(user).toEqual({ password: "unchanged-digest", claimStatus: null });

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, schools[1].userId));
    expect(sessions).toEqual([]);
  });

  it("resets only the caller's school and is idempotent", async () => {
    await db
      .update(users)
      .set({ claimStatus: null, password: "reset-candidate" })
      .where(eq(users.id, schools[0].userId));
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await expect(resetClaimDigests(scoped, "shared-digest")).resolves.toBe(1);
    await expect(resetClaimDigests(scoped, "shared-digest")).resolves.toBe(1);

    const [own] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, schools[0].userId));
    expect(own).toEqual({ password: "shared-digest", claimStatus: "pending" });

    const [other] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, schools[1].userId));
    expect(other).toEqual({ password: "unchanged-digest", claimStatus: null });
  });

  it("counts claim states per school and stores an explicit flag", async () => {
    const scoped = createRepositoryContext(db, tenantOf(schools[0]));
    await expect(countClaimStates(scoped)).resolves.toEqual({
      pending: 1,
      claimed: 0,
      flagged: 0,
      unset: 0
    });

    await setClaimStatus(scoped, schools[0].userId, "flagged");
    await expect(countClaimStates(scoped)).resolves.toEqual({
      pending: 0,
      claimed: 0,
      flagged: 1,
      unset: 0
    });

    const other = createRepositoryContext(db, tenantOf(schools[1]));
    await expect(countClaimStates(other)).resolves.toEqual({
      pending: 0,
      claimed: 0,
      flagged: 0,
      unset: 1
    });
  });
});
