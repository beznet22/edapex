import { eq } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { users } from "../../src/lib/server/db/schema";
import { sha256Hex } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  login,
  makeAdmin,
  request,
  setPassword,
  tenantHeaders,
  testApp
} from "./support/http";

const db = database(env);
const app = testApp();
const DUPLICATE = "dup-router@example.test";
const MERGEABLE = "merge-router@example.test";
let school: SeededSchool;
let cookie: string;

const jsonHeaders = (extra: Record<string, string> = {}): Record<string, string> => ({
  ...extra,
  "content-type": "application/json"
});

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "secret");
  await makeAdmin(school);
  cookie = await login(app, "user1@example.test", "secret");

  await db.update(users).set({ email: DUPLICATE }).where(eq(users.id, school.userId));
  await db.insert(users).values([
    { id: 130, fullName: "Duplicate A", email: DUPLICATE, schoolId: 1 },
    { id: 132, fullName: "Merge Keep", email: MERGEABLE, schoolId: 1 },
    { id: 133, fullName: "Merge Loser", email: MERGEABLE, schoolId: 1 }
  ]);
});

describe("duplicate email routes", () => {
  it("requires an administrator and a tenant", async () => {
    const anonymous = await request(app, "/api/v1/admin/duplicate-emails");
    expect(anonymous.status).toBe(401);

    const missingTenant = await request(app, "/api/v1/admin/duplicate-emails", {
      headers: { cookie }
    });
    expect(missingTenant.status).toBe(400);
    expect(await missingTenant.json()).toMatchObject({ error: "VALIDATION_FAILED" });

    await db.insert(users).values({
      id: 181,
      fullName: "Another Plain",
      email: "plain2@example.test",
      password: await sha256Hex("plain2"),
      schoolId: 1
    });
    const plainCookie = await login(app, "plain2@example.test", "plain2");
    const forbidden = await request(app, "/api/v1/admin/duplicate-emails", {
      headers: tenantHeaders(school, plainCookie)
    });
    expect(forbidden.status).toBe(403);
  });

  it("lists groups and exports them as CSV", async () => {
    const list = await request(app, "/api/v1/admin/duplicate-emails", {
      headers: tenantHeaders(school, cookie)
    });
    expect(list.status).toBe(200);
    const body: unknown = await list.json();
    expect(body).toMatchObject({ groups: expect.any(Array) });

    const csv = await request(app, "/api/v1/admin/duplicate-emails/export", {
      headers: tenantHeaders(school, cookie)
    });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const text = await csv.text();
    expect(text.split("\n")[0]).toContain("email,user_id");
    expect(text).toContain(DUPLICATE);
  });

  it("merges, reassigns and flags through the API", async () => {
    const merge = await request(app, "/api/v1/admin/duplicate-emails/merge", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: JSON.stringify({ email: MERGEABLE, keepUserId: 132, mergeUserIds: [133] })
    });
    expect(merge.status).toBe(204);
    expect(await db.select({ id: users.id }).from(users).where(eq(users.id, 133))).toEqual([]);

    const reassign = await request(app, "/api/v1/admin/duplicate-emails/reassign", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: JSON.stringify({ email: DUPLICATE, targetUserId: school.userId })
    });
    expect(reassign.status).toBe(204);
    const [cleared] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, 130));
    expect(cleared?.email).toBeNull();

    const flag = await request(app, "/api/v1/admin/duplicate-emails/flag", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: JSON.stringify({ userId: 130 })
    });
    expect(flag.status).toBe(204);
    const [flagged] = await db
      .select({ claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, 130));
    expect(flagged?.claimStatus).toBe("flagged");
  });

  it("rejects merging an account that owns a persona record", async () => {
    await db
      .update(users)
      .set({ email: "persona-router@example.test" })
      .where(eq(users.id, school.userId));
    await db.insert(users).values({
      id: 140,
      fullName: "Persona Keep",
      email: "persona-router@example.test",
      schoolId: 1
    });

    const response = await request(app, "/api/v1/admin/duplicate-emails/merge", {
      method: "POST",
      headers: jsonHeaders(tenantHeaders(school, cookie)),
      body: JSON.stringify({
        email: "persona-router@example.test",
        keepUserId: 140,
        mergeUserIds: [school.userId]
      })
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "CONFLICT" });
  });
});
