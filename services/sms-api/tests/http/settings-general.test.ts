import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

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
let school: SeededSchool;
let other: SeededSchool;
let adminCookie: string;
let memberCookie: string;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];
  await setPassword(school, "secret");
  await setPassword(other, "secret");
  await makeAdmin(school);
  adminCookie = await login(app, "user1@example.test", "secret");
  memberCookie = await login(app, "user2@example.test", "secret");
});

describe("general settings routes", () => {
  it("reads and updates the general settings", async () => {
    const read = await request(app, "/api/v1/settings/general", {
      headers: { cookie: adminCookie, "X-Academic-Id": String(school.academicId) }
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      settings: { schoolName: "School 1" }
    });

    const update = await request(app, "/api/v1/settings/general", {
      method: "PATCH",
      headers: {
        ...tenantHeaders(school, adminCookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ schoolName: "Renamed School", phone: "123456" })
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      settings: { schoolName: "Renamed School", phone: "123456" }
    });
  });

  it("rejects unknown keys and non-administrators", async () => {
    const unknown = await request(app, "/api/v1/settings/general", {
      method: "PATCH",
      headers: {
        ...tenantHeaders(school, adminCookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ schoolName: "X", extra: true })
    });
    expect(unknown.status).toBe(400);

    const forbidden = await request(app, "/api/v1/settings/general", {
      headers: tenantHeaders(other, memberCookie)
    });
    expect(forbidden.status).toBe(403);
  });

  it("requires the academic scope", async () => {
    const response = await request(app, "/api/v1/settings/general", {
      headers: { cookie: adminCookie }
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });
});
