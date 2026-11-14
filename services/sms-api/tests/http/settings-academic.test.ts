import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  arrayField,
  isRecord,
  login,
  makeAdmin,
  numberField,
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

const jsonRequest = (
  path: string,
  method: string,
  body: Readonly<Record<string, unknown>>
): Promise<Response> =>
  request(app, path, {
    method,
    headers: {
      ...tenantHeaders(school, adminCookie),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

describe("academic settings routes", () => {
  it("reads, creates and activates academic years", async () => {
    const read = await request(app, "/api/v1/settings/academic-years", {
      headers: tenantHeaders(school, adminCookie)
    });
    expect(read.status).toBe(200);
    const readBody: unknown = await read.json();
    expect(arrayField(readBody, "years").length).toBeGreaterThanOrEqual(1);

    const created = await jsonRequest(
      "/api/v1/settings/academic-years",
      "POST",
      {
        year: "2026/2",
        title: "Current Year",
        startingDate: "2026-01-01",
        endingDate: "2026-12-31"
      }
    );
    expect(created.status).toBe(201);
    const createdBody: unknown = await created.json();
    const year = isRecord(createdBody) ? createdBody["year"] : null;
    const createdId = numberField(year, "id");
    if (createdId === null) throw new Error("created year has no id");

    const activated = await jsonRequest(
      "/api/v1/settings/academic-years/active",
      "PUT",
      { academicId: createdId }
    );
    expect(activated.status).toBe(200);
    const activatedBody: unknown = await activated.json();
    expect(activatedBody).toMatchObject({ activeYear: { id: createdId } });

    const active = await request(
      app,
      "/api/v1/settings/academic-years/active",
      { headers: tenantHeaders(school, adminCookie) }
    );
    expect(active.status).toBe(200);
    expect(await active.json()).toMatchObject({ year: { id: createdId } });
  });

  it("creates and toggles exam types", async () => {
    const created = await jsonRequest("/api/v1/settings/exam-types", "POST", {
      name: "SECOND TERM",
      startsOn: "2027-01-10",
      endsOn: "2027-04-01"
    });
    expect(created.status).toBe(201);
    const createdBody: unknown = await created.json();
    const examType = isRecord(createdBody) ? createdBody["examType"] : null;
    expect(numberField(examType, "id")).not.toBeNull();

    const listed = await request(app, "/api/v1/settings/exam-types", {
      headers: tenantHeaders(school, adminCookie)
    });
    expect(listed.status).toBe(200);
    expect(arrayField(await listed.json(), "examTypes").length).toBeGreaterThanOrEqual(2);

    const toggled = await jsonRequest(
      `/api/v1/settings/exam-types/${school.termId}/active`,
      "PATCH",
      {}
    );
    expect(toggled.status).toBe(200);
    expect(await toggled.json()).toMatchObject({
      examType: { id: school.termId, activeStatus: 0 }
    });

    const missing = await jsonRequest(
      "/api/v1/settings/exam-types/999999/active",
      "PATCH",
      {}
    );
    expect(missing.status).toBe(404);
  });

  it("validates dates and rejects non-administrators", async () => {
    const invalid = await jsonRequest(
      "/api/v1/settings/academic-years",
      "POST",
      {
        year: "2030/1",
        title: "Bad",
        startingDate: "2030-09-14",
        endingDate: "2030-01-10"
      }
    );
    expect(invalid.status).toBe(400);

    const forbidden = await request(
      app,
      "/api/v1/settings/academic-years",
      { headers: tenantHeaders(other, memberCookie) }
    );
    expect(forbidden.status).toBe(403);
  });
});
