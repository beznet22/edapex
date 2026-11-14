import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  login,
  request,
  setPassword,
  tenantHeaders,
  testApp
} from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let cookie: string;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "secret");
  cookie = await login(app, "user1@example.test", "secret");
});

const upsert = (body: Readonly<Record<string, unknown>>): Promise<Response> =>
  request(app, "/api/v1/attendance", {
    method: "PUT",
    headers: {
      ...tenantHeaders(school, cookie),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

describe("attendance routes", () => {
  it("upserts attendance for a student and term", async () => {
    const response = await upsert({
      studentId: school.studentId,
      examTypeId: school.termId,
      attendance: { daysOpened: 10, daysAbsent: 2, daysPresent: 8 }
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toHaveProperty("attendanceId");
  });

  it("rejects inconsistent day totals", async () => {
    const response = await upsert({
      studentId: school.studentId,
      examTypeId: school.termId,
      attendance: { daysOpened: 10, daysAbsent: 2, daysPresent: 7 }
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("requires a class scope", async () => {
    const response = await request(app, "/api/v1/attendance", {
      method: "PUT",
      headers: {
        cookie,
        "X-Academic-Id": String(school.academicId),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        studentId: school.studentId,
        examTypeId: school.termId,
        attendance: { daysOpened: 1, daysAbsent: 0, daysPresent: 1 }
      })
    });
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"TENANT_SCOPE_REQUIRED","message":"Pick a class and section to continue."}'
    );
  });
});
