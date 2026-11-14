import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { authIdentities, users } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { isRecord, request, testApp } from "./support/http";
import {
  SHARED_CLAIM_PASSWORD,
  claimConfig,
  cookiePair,
  cookieValue,
  fakeGoogle,
  stateOf
} from "./support/auth";

const db = database(env);
const EMAIL = "claim-http@example.test";
let school: SeededSchool;

const profile = {
  providerUserId: "google-claim-http",
  email: EMAIL,
  emailVerified: true,
  name: "Claim HTTP"
};

let app: ReturnType<typeof testApp>;

const postClaim = (email: string, password: string) =>
  request(app, "/api/v1/auth/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  const config = await claimConfig();
  app = testApp({ authConfig: config, google: fakeGoogle(profile) });
  await db
    .update(users)
    .set({ email: EMAIL, password: config.claimDigest })
    .where(eq(users.id, school.userId));
});

describe("POST /claim", () => {
  it("returns 202 without a ticket for an unknown address", async () => {
    const response = await postClaim("nobody@example.test", SHARED_CLAIM_PASSWORD);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(cookieValue(response, "__Host-edapex_claim")).toBeNull();
  });

  it("returns 202 and the signed ticket for a valid address", async () => {
    const response = await postClaim(EMAIL.toUpperCase(), SHARED_CLAIM_PASSWORD);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "pending" });
    expect(cookieValue(response, "__Host-edapex_claim")).not.toBeNull();
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  it("rejects a wrong shared password", async () => {
    const response = await postClaim(EMAIL, "wrong-password");
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "UNAUTHENTICATED" });
  });

  it("stops a duplicate address with the 409 envelope", async () => {
    await db.insert(users).values([
      { id: 170, fullName: "Ambiguous A", email: "dup-http@example.test", schoolId: 1 },
      { id: 171, fullName: "Ambiguous B", email: "dup-http@example.test", schoolId: 1 }
    ]);
    const response = await postClaim("dup-http@example.test", SHARED_CLAIM_PASSWORD);
    expect(response.status).toBe(409);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "AMBIGUOUS_EMAIL" });
    expect(isRecord(body) && typeof body["requestId"] === "string").toBe(true);
  });

  it("rate-limits repeated attempts on one address", async () => {
    let lastStatus = 0;
    for (let index = 0; index < 6; index += 1) {
      const response = await postClaim("rate-http@example.test", SHARED_CLAIM_PASSWORD);
      lastStatus = response.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("runs the whole claim → Google → session flow", async () => {
    const claim = await postClaim(EMAIL, SHARED_CLAIM_PASSWORD);
    const claimCookie = cookiePair(claim, "__Host-edapex_claim");
    if (claimCookie === null) throw new Error("claim did not set a ticket");

    const start = await request(app, "/api/v1/auth/google/start", {
      headers: { cookie: claimCookie }
    });
    expect(start.status).toBe(200);
    const startBody: unknown = await start.json();
    const authorizeUrl =
      isRecord(startBody) && typeof startBody["authorizeUrl"] === "string"
        ? startBody["authorizeUrl"]
        : null;
    if (authorizeUrl === null) throw new Error("start did not return an authorize URL");
    const state = stateOf(authorizeUrl);
    if (state === null) throw new Error("authorize URL had no state");

    const oauthCookie = cookiePair(start, "__Host-edapex_oauth");
    if (oauthCookie === null) throw new Error("start did not set the OAuth cookie");

    const callback = await request(
      app,
      `/api/v1/auth/google/callback?code=code-1&state=${state}`,
      { headers: { cookie: oauthCookie } }
    );
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/app");

    const sessionCookie = cookiePair(callback, "__Host-edapex_session");
    if (sessionCookie === null) throw new Error("callback did not set a session");

    const me = await request(app, "/api/v1/me", {
      headers: { cookie: sessionCookie }
    });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { id: school.userId } });

    const [user] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, school.userId));
    expect(user).toEqual({ password: null, claimStatus: "claimed" });

    const identities = await db
      .select({ providerUserId: authIdentities.providerUserId })
      .from(authIdentities)
      .where(eq(authIdentities.userId, school.userId));
    expect(identities).toEqual([{ providerUserId: "google-claim-http" }]);

  });
});
