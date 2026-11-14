import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { users } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  createSessionToken,
  isRecord,
  login,
  request,
  stringField,
  testApp
} from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
});

describe("auth routes", () => {
  it("retires password login routes", async () => {
    for (const path of ["/api/v1/auth/login", "/api/v1/auth/mobile/login"]) {
      const response = await request(app, path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: "user1@example.test", password: "secret" })
      });
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: "UNAUTHENTICATED" });
    }
  });

  it("reads the session without a tenant scope and rejects anonymous access", async () => {
    const cookie = await login(app, "user1@example.test", "secret");
    const response = await request(app, "/api/v1/me", { headers: { cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      user: { id: school.userId },
      sessionId: expect.any(String),
      expiresAt: expect.any(Number)
    });

    const anonymous = await request(app, "/api/v1/me");
    expect(anonymous.status).toBe(401);
    const error: unknown = await anonymous.json();
    expect(error).toMatchObject({ error: "UNAUTHENTICATED" });
    expect(isRecord(error) && typeof error["requestId"] === "string").toBe(true);
  });

  it("rotates the session and rejects the old cookie", async () => {
    const oldCookie = await login(app, "user1@example.test", "secret");
    const response = await request(app, "/api/v1/auth/refresh", {
      method: "POST",
      headers: { cookie: oldCookie }
    });
    expect(response.status).toBe(200);
    const nextCookie = (response.headers.get("set-cookie") ?? "").split(";")[0];
    if (nextCookie === undefined || nextCookie.length === 0) {
      throw new Error("refresh did not set a cookie");
    }
    expect(nextCookie).not.toBe(oldCookie);

    expect((await request(app, "/api/v1/me", { headers: { cookie: oldCookie } })).status).toBe(401);
    expect((await request(app, "/api/v1/me", { headers: { cookie: nextCookie } })).status).toBe(200);
  });

  it("clears the cookie on logout and revokes every session on logout-all", async () => {
    const firstCookie = await login(app, "user1@example.test", "secret");
    const secondCookie = await login(app, "user1@example.test", "secret");

    const logout = await request(app, "/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: firstCookie }
    });
    expect(logout.status).toBe(204);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await request(app, "/api/v1/me", { headers: { cookie: firstCookie } })).status).toBe(401);

    const thirdCookie = await login(app, "user1@example.test", "secret");
    const logoutAll = await request(app, "/api/v1/auth/logout-all", {
      method: "POST",
      headers: { cookie: thirdCookie }
    });
    expect(logoutAll.status).toBe(204);
    expect((await request(app, "/api/v1/me", { headers: { cookie: thirdCookie } })).status).toBe(401);
    expect((await request(app, "/api/v1/me", { headers: { cookie: secondCookie } })).status).toBe(401);
  });

  it("refreshes and revokes a mobile token", async () => {
    const { token } = await createSessionToken("user1@example.test");

    const refresh = await request(app, "/api/v1/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token })
    });
    expect(refresh.status).toBe(200);
    const refreshBody: unknown = await refresh.json();
    const nextToken = stringField(refreshBody, "token");
    if (nextToken === null) throw new Error("mobile refresh did not return a token");

    const logout = await request(app, "/api/v1/auth/mobile/logout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: nextToken })
    });
    expect(logout.status).toBe(204);

    const after = await request(app, "/api/v1/auth/mobile/refresh", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: nextToken })
    });
    expect(after.status).toBe(401);
  });

  it("updates the profile through the unscoped context", async () => {
    const cookie = await login(app, "user1@example.test", "secret");
    const response = await request(app, "/api/v1/me", {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ fullName: "Renamed User" })
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ user: { id: school.userId, fullName: "Renamed User" } });

    const rows = await db
      .select({ fullName: users.fullName })
      .from(users)
      .where(eq(users.id, school.userId));
    expect(rows[0]?.fullName).toBe("Renamed User");
  });
});
