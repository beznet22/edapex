import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authIdentities, users } from "../../src/lib/server/db/schema";
import { sha256Base64Url, type GoogleOAuthPort } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import { claimConfig, cookiePair, fakeGoogle, stateOf } from "./support/auth";
import { isRecord, request, testApp } from "./support/http";

const db = database(env);
const email = "desktop@example.test";
const verifier = "a".repeat(64);

const google: GoogleOAuthPort = fakeGoogle({
  providerUserId: "desktop-google",
  email,
  emailVerified: true,
  name: "Desktop User"
});

const appWithConfig = async () =>
  testApp({ authConfig: await claimConfig(), google });

beforeAll(async () => {
  await seedTwoSchools(db);
  await db.insert(users).values({
    id: 160,
    fullName: "Desktop User",
    email,
    password: null,
    claimStatus: "claimed",
    schoolId: 1
  });
  await db.insert(authIdentities).values({
    id: "desktop-google-identity",
    userId: 160,
    provider: "google",
    providerUserId: "desktop-google",
    emailAtProvider: email,
    emailVerified: 1,
    createdAt: 1_700_000_000
  });
});

const start = async (app: ReturnType<typeof testApp>) => {
  const codeChallenge = await sha256Base64Url(verifier);
  const response = await request(app, "/api/v1/auth/desktop/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ codeChallenge, redirectUri: "edapex://auth" })
  });
  const body: unknown = await response.json();
  const authorizeUrl =
    isRecord(body) && typeof body["authorizeUrl"] === "string"
      ? body["authorizeUrl"]
      : null;
  return {
    response,
    authorizeUrl,
    cookie: cookiePair(response, "__Host-edapex_oauth")
  };
};

describe("desktop PKCE auth", () => {
  it("starts, redirects to the app scheme and exchanges a one-time code", async () => {
    const app = await appWithConfig();
    const started = await start(app);
    expect(started.response.status).toBe(200);
    if (started.authorizeUrl === null || started.cookie === null) {
      throw new Error("desktop start did not produce an OAuth URL/cookie");
    }
    const state = stateOf(started.authorizeUrl);
    if (state === null) throw new Error("desktop start has no state");

    const callback = await request(
      app,
      `/api/v1/auth/google/callback?code=code&state=${state}`,
      { headers: { cookie: started.cookie } }
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("set-cookie") ?? "").not.toContain(
      "__Host-edapex_session="
    );
    const location = callback.headers.get("location");
    if (location === null) throw new Error("desktop callback did not redirect");
    const code = new URL(location).searchParams.get("code");
    if (code === null) throw new Error("desktop callback has no code");

    const exchanged = await request(app, "/api/v1/auth/desktop/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier })
    });
    expect(exchanged.status).toBe(200);
    const result: unknown = await exchanged.json();
    if (!isRecord(result) || typeof result["token"] !== "string") {
      throw new Error("desktop exchange did not return a token");
    }

    const me = await request(app, "/api/v1/me", {
      headers: { authorization: `Bearer ${result["token"]}` }
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: 160 } });

    const replay = await request(app, "/api/v1/auth/desktop/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier })
    });
    expect(replay.status).toBe(401);
  });

  it("rejects a verifier that does not match the challenge", async () => {
    const app = await appWithConfig();
    const started = await start(app);
    if (started.authorizeUrl === null || started.cookie === null) {
      throw new Error("desktop start did not produce an OAuth URL/cookie");
    }
    const state = stateOf(started.authorizeUrl);
    if (state === null) throw new Error("desktop start has no state");

    const callback = await request(
      app,
      `/api/v1/auth/google/callback?code=code&state=${state}`,
      { headers: { cookie: started.cookie } }
    );
    const location = callback.headers.get("location");
    if (location === null) throw new Error("desktop callback did not redirect");
    const code = new URL(location).searchParams.get("code");
    if (code === null) throw new Error("desktop callback has no code");

    const exchanged = await request(app, "/api/v1/auth/desktop/exchange", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: "b".repeat(64) })
    });
    expect(exchanged.status).toBe(401);
  });

  it("keeps the desktop endpoints closed until Google and the secret are configured", async () => {
    const app = testApp();
    const response = await request(app, "/api/v1/auth/desktop/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        codeChallenge: await sha256Base64Url(verifier),
        redirectUri: "edapex://auth"
      })
    });
    expect(response.status).toBe(404);
  });
});
