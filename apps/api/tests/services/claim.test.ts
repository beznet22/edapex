import { and, eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authEvents, authIdentities, authSessions, users } from "../../src/lib/server/db/schema";
import { createServiceContext } from "../../src/lib/server/services/context";
import {
  AmbiguousEmailError,
  AuthError,
  ClaimService,
  ConflictError,
  LinkEmailMismatchError,
  LinkEmailUnverifiedError,
  RateLimitError,
  isClaimTicketPayload,
  sha256Hex,
  verifyPayload
} from "../../src/lib/server/services";
import type { ServiceContext } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";

const db = database(env);
const NOW = 1_700_100_000;
const SECRET = "claim-cookie-secret";
const SHARED = "shared-claim-secret";
const CLAIM_EMAIL = "claimant@example.test";
const COMPLETE_EMAIL = "complete@example.test";

let schools: readonly [SeededSchool, SeededSchool];
let digest: string;
let ctx: ServiceContext;

const clock = { now: () => NOW };

const claimInput = (email: string, password: string, ip: string) => ({
  email,
  password,
  ip,
  userAgent: "vitest"
});

beforeAll(async () => {
  schools = await seedTwoSchools(db);
  digest = await sha256Hex(SHARED);
  await db
    .update(users)
    .set({ email: CLAIM_EMAIL, password: digest, claimStatus: "pending" })
    .where(eq(users.id, schools[0].userId));
  await db.insert(users).values([
    {
      id: 140,
      fullName: "Complete Candidate",
      email: COMPLETE_EMAIL,
      password: digest,
      claimStatus: "pending",
      schoolId: 1
    },
    {
      id: 141,
      fullName: "Ambiguous One",
      email: "ambiguous@example.test",
      password: digest,
      schoolId: 1
    },
    {
      id: 142,
      fullName: "Ambiguous Two",
      email: "ambiguous@example.test",
      password: digest,
      schoolId: 1
    }
  ]);
  await db.insert(authSessions).values({
    id: "complete-old-session",
    userId: 140,
    tokenHash: "complete-old-hash",
    expiresAt: NOW + 1000,
    deviceFingerprint: null,
    createdAt: NOW - 10
  });

  ctx = createServiceContext(env, null, {
    ports: {
      clock,
      authConfig: {
        claimEnabled: true,
        claimDigest: digest,
        legacyPasswordLogin: false,
        cookieSecret: SECRET,
        googleConfigured: true,
        postLoginRedirect: "/"
      }
    }
  });
});

describe("claim service", () => {
  it("returns the same empty result for an unknown email and records the attempt", async () => {
    const result = await new ClaimService(ctx).request(
      claimInput("nobody@example.test", SHARED, "198.51.100.1")
    );
    expect(result).toEqual({ ticket: null });

    const attempts = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(
        and(eq(authEvents.type, "claim_attempt"), eq(authEvents.email, "nobody@example.test"))
      );
    expect(attempts).toHaveLength(1);
  });

  it("issues a verifiable claim ticket for the shared digest", async () => {
    const result = await new ClaimService(ctx).request(
      claimInput(CLAIM_EMAIL, SHARED, "198.51.100.2")
    );
    if (result.ticket === null) throw new Error("expected a claim ticket");

    await expect(
      verifyPayload(SECRET, result.ticket, isClaimTicketPayload, NOW)
    ).resolves.toMatchObject({ purpose: "claim", userId: schools[0].userId });

    const issued = await db
      .select({ id: authEvents.id })
      .from(authEvents)
      .where(eq(authEvents.type, "claim_ticket_issued"));
    expect(issued).toHaveLength(1);
  });

  it("rejects a wrong password without issuing a ticket", async () => {
    await expect(
      new ClaimService(ctx).request(claimInput(CLAIM_EMAIL, "wrong", "198.51.100.3"))
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("stops an ambiguous address with AMBIGUOUS_EMAIL", async () => {
    await expect(
      new ClaimService(ctx).request(
        claimInput("ambiguous@example.test", SHARED, "198.51.100.4")
      )
    ).rejects.toBeInstanceOf(AmbiguousEmailError);
  });

  it("keeps a flagged account out of the claim flow", async () => {
    await db.update(users).set({ claimStatus: "flagged" }).where(eq(users.id, 140));
    await expect(
      new ClaimService(ctx).request(claimInput(COMPLETE_EMAIL, SHARED, "198.51.100.5"))
    ).rejects.toBeInstanceOf(ConflictError);
    await db.update(users).set({ claimStatus: "pending" }).where(eq(users.id, 140));
  });

  it("rate-limits repeated attempts per email and IP", async () => {
    const attempts = Array.from({ length: 6 }, (_, index) =>
      new ClaimService(ctx).request(
        claimInput("rate@example.test", SHARED, `203.0.113.${index + 10}`)
      )
    );
    const settled = await Promise.allSettled(attempts);
    const rejected = settled.filter((entry) => entry.status === "rejected");
    expect(rejected).toHaveLength(1);
    const [failure] = rejected;
    if (failure?.status !== "rejected") throw new Error("expected a rejection");
    expect(failure.reason).toBeInstanceOf(RateLimitError);
  });

  it("completes the link, clears the password and replaces sessions", async () => {
    const result = await new ClaimService(ctx).complete({
      userId: 140,
      profile: {
        providerUserId: "google-140",
        email: COMPLETE_EMAIL.toUpperCase(),
        emailVerified: true,
        name: "Complete Candidate"
      },
      ip: "198.51.100.6",
      userAgent: "vitest",
      fingerprint: "device-1"
    });

    const [user] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 140));
    expect(user).toEqual({ password: null, claimStatus: "claimed" });

    const identities = await db
      .select({ providerUserId: authIdentities.providerUserId, emailVerified: authIdentities.emailVerified })
      .from(authIdentities)
      .where(eq(authIdentities.userId, 140));
    expect(identities).toEqual([{ providerUserId: "google-140", emailVerified: 1 }]);

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, 140));
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).not.toBe("complete-old-session");
    expect(result.user.id).toBe(140);
  });

  it("replaces only the session when the same identity retries", async () => {
    const result = await new ClaimService(ctx).complete({
      userId: 140,
      profile: {
        providerUserId: "google-140",
        email: COMPLETE_EMAIL,
        emailVerified: true,
        name: null
      },
      ip: "198.51.100.7",
      userAgent: "vitest",
      fingerprint: "device-2"
    });
    expect(result.user.id).toBe(140);

    const identities = await db
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(eq(authIdentities.userId, 140));
    expect(identities).toHaveLength(1);
  });

  it("rejects an unverified or mismatched Google address", async () => {
    await expect(
      new ClaimService(ctx).complete({
        userId: 140,
        profile: {
          providerUserId: "google-140",
          email: COMPLETE_EMAIL,
          emailVerified: false,
          name: null
        },
        ip: null,
        userAgent: null,
        fingerprint: null
      })
    ).rejects.toBeInstanceOf(LinkEmailUnverifiedError);

    await expect(
      new ClaimService(ctx).complete({
        userId: 140,
        profile: {
          providerUserId: "google-140",
          email: "someone-else@example.test",
          emailVerified: true,
          name: null
        },
        ip: null,
        userAgent: null,
        fingerprint: null
      })
    ).rejects.toBeInstanceOf(LinkEmailMismatchError);
  });

  it("refuses an identity already bound to another account", async () => {
    await db.insert(authIdentities).values({
      id: "bound-identity",
      userId: schools[1].userId,
      provider: "google",
      providerUserId: "google-bound",
      emailAtProvider: "bound@example.test",
      emailVerified: 1,
      createdAt: NOW
    });

    await expect(
      new ClaimService(ctx).complete({
        userId: 140,
        profile: {
          providerUserId: "google-bound",
          email: COMPLETE_EMAIL,
          emailVerified: true,
          name: null
        },
        ip: null,
        userAgent: null,
        fingerprint: null
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
