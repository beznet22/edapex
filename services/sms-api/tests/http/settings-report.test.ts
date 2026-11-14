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

describe("report settings routes", () => {
  it("reads defaults and saves a patch with the acting staff id", async () => {
    const read = await request(app, "/api/v1/settings/report-templates", {
      headers: tenantHeaders(school, adminCookie)
    });
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      settings: { principalName: "Patience Okwube" }
    });

    const update = await request(app, "/api/v1/settings/report-templates", {
      method: "PATCH",
      headers: {
        ...tenantHeaders(school, adminCookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        principalName: "New Principal",
        supportEmail: "support@example.test"
      })
    });
    expect(update.status).toBe(200);
    expect(await update.json()).toMatchObject({
      settings: {
        principalName: "New Principal",
        supportEmail: "support@example.test",
        updatedBy: school.staffId
      }
    });
  });

  it("rejects unknown keys and non-administrators", async () => {
    const unknown = await request(app, "/api/v1/settings/report-templates", {
      method: "PATCH",
      headers: {
        ...tenantHeaders(school, adminCookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ principalName: "X", extra: true })
    });
    expect(unknown.status).toBe(400);

    const forbidden = await request(app, "/api/v1/settings/report-templates", {
      headers: tenantHeaders(other, memberCookie)
    });
    expect(forbidden.status).toBe(403);
  });
});
