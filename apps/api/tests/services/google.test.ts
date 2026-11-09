import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authEvents, authIdentities, authSessions, users } from "../../src/lib/server/db/schema";
import { createServiceContext } from "../../src/lib/server/services/context";
import {
  AmbiguousEmailError,
  AuthError,
  ConflictError,
  GoogleService,
  LinkEmailUnverifiedError,
  PermissionError,
  isGoogleStatePayload,
  sha256Hex,
  verifyPayload
} from "../../src/lib/server/services";
import type { GoogleOAuthPort, GoogleProfile, ServiceContext } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";

const db = database(env);
const NOW = 1_700_200_000;
const SECRET = "google-cookie-secret";
const SIGNIN_EMAIL = "signin@example.test";
const LINK_EMAIL = "link@example.test";
const UNCLAIMED_EMAIL = "unclaimed@example.test";
const LINKED_EMAIL = "linked@example.test";

let ctx: ServiceContext;
let currentProfile: GoogleProfile;

const clock = { now: () => NOW };

const google: GoogleOAuthPort = {
  authorizeUrl: ({ state, codeChallenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?state=${state}&code_challenge=${codeChallenge}`,
  exchange: async () => currentProfile
};

const config = (googleConfigured: boolean) => ({
  claimEnabled: true,
  claimDigest: "a".repeat(64),
  cookieSecret: SECRET,
  googleConfigured,
  postLoginRedirect: "/"
});

const callbackInput = (purpose: "signin" | "claim", claimUserId: number | null) => ({
  code: "code-1",
  codeVerifier: "verifier-1",
  purpose,
  claimUserId,
  ip: "198.51.100.20",
  userAgent: "vitest",
  fingerprint: null
});

beforeAll(async () => {
  await seedTwoSchools(db);
  const digest = await sha256Hex("shared-secret");
  await db.insert(users).values([
    {
      id: 140,
      fullName: "Claim Link",
      email: LINK_EMAIL,
      password: digest,
      claimStatus: "pending",
      schoolId: 1
    },
    {
      id: 150,
      fullName: "Sign In",
      email: SIGNIN_EMAIL,
      password: null,
      claimStatus: "claimed",
      schoolId: 1
    },
    {
      id: 151,
      fullName: "Unclaimed",
      email: UNCLAIMED_EMAIL,
      password: digest,
      claimStatus: "pending",
      schoolId: 1
    },
    {
      id: 152,
      fullName: "Ambiguous A",
      email: "ambiguous-google@example.test",
      schoolId: 1
    },
    {
      id: 153,
      fullName: "Ambiguous B",
      email: "ambiguous-google@example.test",
      schoolId: 1
    },
    {
      id: 154,
      fullName: "Linked at Sign In",
      email: LINKED_EMAIL,
      password: null,
      claimStatus: "claimed",
      schoolId: 1
    }
  ]);
  await db.insert(authIdentities).values({
    id: "signin-identity",
    userId: 150,
    provider: "google",
    providerUserId: "google-signin",
    emailAtProvider: SIGNIN_EMAIL,
    emailVerified: 1,
    createdAt: NOW
  });

  ctx = createServiceContext(env, null, {
    ports: { clock, google, authConfig: config(true) }
  });
});

describe("google service", () => {
  it("starts a flow with state and PKCE bound in a signed cookie", async () => {
    const result = await new GoogleService(ctx).start({ purpose: "claim", claimUserId: 140 });
    const payload = await verifyPayload(
      SECRET,
      result.oauthCookie,
      isGoogleStatePayload,
      NOW
    );
    if (payload === null) throw new Error("expected a signed state payload");

    expect(payload).toMatchObject({ purpose: "claim", userId: 140 });
    expect(result.authorizeUrl).toContain(`state=${payload.state}`);
    expect(result.authorizeUrl).toContain("code_challenge=");
    expect(result.expiresAt).toBeGreaterThan(NOW);
  });

  it("completes a claim-purpose callback through the link rules", async () => {
    currentProfile = {
      providerUserId: "google-140",
      email: LINK_EMAIL,
      emailVerified: true,
      name: "Claim Link"
    };
    const result = await new GoogleService(ctx).callback(callbackInput("claim", 140));
    expect(result.user.id).toBe(140);

    const [user] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 140));
    expect(user).toEqual({ password: null, claimStatus: "claimed" });
  });

  it("signs in an existing identity and records the outcome", async () => {
    currentProfile = {
      providerUserId: "google-signin",
      email: SIGNIN_EMAIL,
      emailVerified: true,
      name: "Sign In"
    };
    const result = await new GoogleService(ctx).callback(callbackInput("signin", null));
    expect(result.user.id).toBe(150);

    const sessions = await db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.userId, 150));
    expect(sessions).toHaveLength(1);

    const events = await db
      .select({ metadata: authEvents.metadata })
      .from(authEvents)
      .where(eq(authEvents.type, "google_signin"));
    expect(events.some((row) => row.metadata === '{"outcome":"existing_identity"}')).toBe(true);
  });

  it("links an already-claimed account at sign-in", async () => {
    currentProfile = {
      providerUserId: "google-linked",
      email: LINKED_EMAIL,
      emailVerified: true,
      name: null
    };
    const result = await new GoogleService(ctx).callback(callbackInput("signin", null));
    expect(result.user.id).toBe(154);

    const identities = await db
      .select({ providerUserId: authIdentities.providerUserId })
      .from(authIdentities)
      .where(eq(authIdentities.userId, 154));
    expect(identities).toEqual([{ providerUserId: "google-linked" }]);
  });

  it("refuses an unclaimed account, an unknown address and an ambiguous address", async () => {
    currentProfile = {
      providerUserId: "google-unclaimed",
      email: UNCLAIMED_EMAIL,
      emailVerified: true,
      name: null
    };
    await expect(
      new GoogleService(ctx).callback(callbackInput("signin", null))
    ).rejects.toBeInstanceOf(ConflictError);

    currentProfile = {
      providerUserId: "google-unknown",
      email: "unknown@example.test",
      emailVerified: true,
      name: null
    };
    await expect(
      new GoogleService(ctx).callback(callbackInput("signin", null))
    ).rejects.toBeInstanceOf(PermissionError);

    currentProfile = {
      providerUserId: "google-ambiguous",
      email: "ambiguous-google@example.test",
      emailVerified: true,
      name: null
    };
    await expect(
      new GoogleService(ctx).callback(callbackInput("signin", null))
    ).rejects.toBeInstanceOf(AmbiguousEmailError);
  });

  it("rejects unverified profiles and a claim callback without a ticket", async () => {
    currentProfile = {
      providerUserId: "google-unverified",
      email: SIGNIN_EMAIL,
      emailVerified: false,
      name: null
    };
    await expect(
      new GoogleService(ctx).callback(callbackInput("signin", null))
    ).rejects.toBeInstanceOf(LinkEmailUnverifiedError);

    currentProfile = {
      providerUserId: "google-140",
      email: LINK_EMAIL,
      emailVerified: true,
      name: null
    };
    await expect(
      new GoogleService(ctx).callback(callbackInput("claim", null))
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("refuses to start when Google is not configured", async () => {
    const unconfigured = createServiceContext(env, null, {
      ports: { clock, google, authConfig: config(false) }
    });
    await expect(
      new GoogleService(unconfigured).start({ purpose: "signin", claimUserId: null })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
