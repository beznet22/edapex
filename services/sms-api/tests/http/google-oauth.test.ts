import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authIdentities, users } from "../../src/lib/server/db/schema";
import type { GoogleOAuthPort, GoogleProfile } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import { isRecord, request, testApp } from "./support/http";
import { claimConfig, cookiePair, cookieValue, stateOf } from "./support/auth";

const db = database(env);
const SIGNIN_EMAIL = "google-http@example.test";
let currentProfile: GoogleProfile;

const google: GoogleOAuthPort = {
  authorizeUrl: ({ state, codeChallenge }) =>
    `https://accounts.example.test/o/oauth2/auth?state=${state}&code_challenge=${codeChallenge}`,
  exchange: async () => currentProfile
};

const appWithConfig = () => claimConfig().then((config) => testApp({ authConfig: config, google }));

const startFlow = async (app: ReturnType<typeof testApp>, headers: Record<string, string> = {}) => {
  const start = await request(app, "/api/v1/auth/google/start", { headers });
  const body: unknown = await start.json();
  const authorizeUrl =
    isRecord(body) && typeof body["authorizeUrl"] === "string"
      ? body["authorizeUrl"]
      : null;
  return { start, authorizeUrl, cookie: cookiePair(start, "__Host-edapex_oauth") };
};

beforeAll(async () => {
  await seedTwoSchools(db);
  await db.insert(users).values({
    id: 150,
    fullName: "Google HTTP",
    email: SIGNIN_EMAIL,
    password: null,
    claimStatus: "claimed",
    schoolId: 1
  });
  await db.insert(authIdentities).values({
    id: "google-http-identity",
    userId: 150,
    provider: "google",
    providerUserId: "google-http",
    emailAtProvider: SIGNIN_EMAIL,
    emailVerified: 1,
    createdAt: 1_700_000_000
  });
});

describe("Google OAuth routes", () => {
  it("stays absent until configured", async () => {
    const app = testApp();
    expect((await request(app, "/api/v1/auth/google/start")).status).toBe(404);
    expect(
      (await request(app, "/api/v1/auth/google/callback?code=c&state=s")).status
    ).toBe(404);
  });

  it("starts a sign-in flow with state and an OAuth cookie", async () => {
    const app = await appWithConfig();
    const { start, authorizeUrl, cookie } = await startFlow(app);
    expect(start.status).toBe(200);
    expect(authorizeUrl).not.toBeNull();
    expect(cookieValue(start, "__Host-edapex_oauth")).not.toBeNull();
    expect(cookie).not.toBeNull();
  });

  it("redirects an HTML client", async () => {
    const app = await appWithConfig();
    const start = await request(app, "/api/v1/auth/google/start", {
      headers: { accept: "text/html" }
    });
    expect(start.status).toBe(302);
    expect(start.headers.get("location")).toContain("accounts.example.test");
  });

  it("rejects a missing, mismatched or expired state", async () => {
    const app = await appWithConfig();
    const missing = await request(app, "/api/v1/auth/google/callback?code=c&state=s");
    expect(missing.status).toBe(401);

    const { cookie } = await startFlow(app);
    if (cookie === null) throw new Error("no OAuth cookie");
    const mismatch = await request(app, "/api/v1/auth/google/callback?code=c&state=wrong", {
      headers: { cookie }
    });
    expect(mismatch.status).toBe(401);
  });

  it("rejects an unverified profile", async () => {
    currentProfile = {
      providerUserId: "google-http",
      email: SIGNIN_EMAIL,
      emailVerified: false,
      name: null
    };
    const app = await appWithConfig();
    const { authorizeUrl, cookie } = await startFlow(app);
    const state = stateOf(authorizeUrl ?? "");
    if (cookie === null || state === null) throw new Error("no state");

    const response = await request(
      app,
      `/api/v1/auth/google/callback?code=c&state=${state}`,
      { headers: { cookie } }
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "LINK_EMAIL_UNVERIFIED" });
  });

  it("signs in an existing identity and sets the session cookie", async () => {
    currentProfile = {
      providerUserId: "google-http",
      email: SIGNIN_EMAIL,
      emailVerified: true,
      name: "Google HTTP"
    };
    const app = await appWithConfig();
    const { authorizeUrl, cookie } = await startFlow(app);
    const state = stateOf(authorizeUrl ?? "");
    if (cookie === null || state === null) throw new Error("no state");

    const callback = await request(
      app,
      `/api/v1/auth/google/callback?code=c&state=${state}`,
      { headers: { cookie } }
    );
    expect(callback.status).toBe(302);

    const session = cookiePair(callback, "__Host-edapex_session");
    if (session === null) throw new Error("no session cookie");
    const me = await request(app, "/api/v1/me", { headers: { cookie: session } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: 150 } });
  });

  it("refuses an address the school has not provisioned", async () => {
    currentProfile = {
      providerUserId: "google-unknown-http",
      email: "unprovisioned@example.test",
      emailVerified: true,
      name: null
    };
    const app = await appWithConfig();
    const { authorizeUrl, cookie } = await startFlow(app);
    const state = stateOf(authorizeUrl ?? "");
    if (cookie === null || state === null) throw new Error("no state");

    const response = await request(
      app,
      `/api/v1/auth/google/callback?code=c&state=${state}`,
      { headers: { cookie } }
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "FORBIDDEN" });
  });

  it("links an already-claimed account at sign-in", async () => {
    currentProfile = {
      providerUserId: "google-link-http",
      email: "linked-http@example.test",
      emailVerified: true,
      name: null
    };
    await db.insert(users).values({
      id: 151,
      fullName: "Linked HTTP",
      email: "linked-http@example.test",
      password: null,
      claimStatus: "claimed",
      schoolId: 1
    });
    const app = await appWithConfig();
    const { authorizeUrl, cookie } = await startFlow(app);
    const state = stateOf(authorizeUrl ?? "");
    if (cookie === null || state === null) throw new Error("no state");

    const callback = await request(
      app,
      `/api/v1/auth/google/callback?code=c&state=${state}`,
      { headers: { cookie } }
    );
    expect(callback.status).toBe(302);

    const identities = await db
      .select({ providerUserId: authIdentities.providerUserId })
      .from(authIdentities)
      .where(eq(authIdentities.userId, 151));
    expect(identities).toEqual([{ providerUserId: "google-link-http" }]);

    const [user] = await db
      .select({ claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 151));
    expect(user?.claimStatus).toBe("claimed");
  });
});
