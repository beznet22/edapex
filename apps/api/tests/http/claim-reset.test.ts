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
import { SHARED_CLAIM_PASSWORD, claimConfig } from "./support/auth";

const db = database(env);
let school: SeededSchool;
let cookie: string;
let app: ReturnType<typeof testApp>;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "secret");
  await makeAdmin(school);
  app = testApp({ authConfig: await claimConfig({ legacyPasswordLogin: true }) });
  cookie = await login(app, "user1@example.test", "secret");
});

const resetBody = (confirm: string) =>
  JSON.stringify({ confirm });

describe("claim reset route", () => {
  it("writes the shared digest and reports the count", async () => {
    const response = await request(app, "/api/v1/admin/auth/claim-reset", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: resetBody("RESET_ALL_PASSWORDS")
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ schoolId: 1, count: 1, pending: 1 });

    const [row] = await db
      .select({ password: users.password, claimStatus: users.claimStatus })
      .from(users)
      .where(eq(users.id, school.userId));
    expect(row).toEqual({
      password: await sha256Hex(SHARED_CLAIM_PASSWORD),
      claimStatus: "pending"
    });
  });

  it("requires the explicit confirmation token", async () => {
    const response = await request(app, "/api/v1/admin/auth/claim-reset", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: resetBody("yes")
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("refuses a disabled claim flow", async () => {
    const disabled = await request(testApp(), "/api/v1/admin/auth/claim-reset", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: resetBody("RESET_ALL_PASSWORDS")
    });
    expect(disabled.status).toBe(409);
    expect(await disabled.json()).toMatchObject({ error: "CONFLICT" });
  });

  it("refuses a non-administrator", async () => {
    await db.insert(users).values({
      id: 182,
      fullName: "Reset Plain",
      email: "reset-plain@example.test",
      password: await sha256Hex("reset-plain"),
      schoolId: 1
    });
    const plainCookie = await login(app, "reset-plain@example.test", "reset-plain");
    const response = await request(app, "/api/v1/admin/auth/claim-reset", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, plainCookie),
        "content-type": "application/json"
      },
      body: resetBody("RESET_ALL_PASSWORDS")
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "FORBIDDEN" });
  });
});
