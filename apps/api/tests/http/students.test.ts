import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { smStudents } from "../../src/lib/server/db/schema";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  arrayField,
  isRecord,
  login,
  request,
  setPassword,
  tenantHeaders,
  testApp
} from "./support/http";

const db = database(env);
const app = testApp();
let school: SeededSchool;
let other: SeededSchool;
let cookie: string;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];
  await setPassword(school, "secret");
  cookie = await login(app, "user1@example.test", "secret");
});

describe("student routes", () => {
  it("lists the active roster and filters by name", async () => {
    const roster = await request(app, "/api/v1/students", {
      headers: tenantHeaders(school, cookie)
    });
    expect(roster.status).toBe(200);
    const rosterBody: unknown = await roster.json();
    expect(arrayField(rosterBody, "rows")).toHaveLength(1);
    expect(rosterBody).toMatchObject({
      rows: [{ id: school.studentId, fullName: "Student 1" }],
      nextCursor: null
    });

    const search = await request(app, "/api/v1/students?q=Student", {
      headers: tenantHeaders(school, cookie)
    });
    expect(search.status).toBe(200);
    expect(arrayField(await search.json(), "rows")).toHaveLength(1);

    const miss = await request(app, "/api/v1/students?q=zzzz", {
      headers: tenantHeaders(school, cookie)
    });
    expect(miss.status).toBe(200);
    expect(arrayField(await miss.json(), "rows")).toHaveLength(0);
  });

  it("updates the student status", async () => {
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/status`,
      {
        method: "PATCH",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({ active: false })
      }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      studentId: school.studentId,
      active: false
    });

    const rows = await db
      .select({ activeStatus: smStudents.activeStatus })
      .from(smStudents)
      .where(eq(smStudents.id, school.studentId));
    expect(rows[0]?.activeStatus).toBe(0);
  });

  it("returns the exact 422 body when the class scope is missing", async () => {
    const response = await request(app, "/api/v1/students", {
      headers: {
        cookie,
        "X-Academic-Id": String(school.academicId)
      }
    });
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"TENANT_SCOPE_REQUIRED","message":"Pick a class and section to continue."}'
    );
  });

  it("requires the academic header", async () => {
    const response = await request(app, "/api/v1/students", {
      headers: { cookie }
    });
    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "VALIDATION_FAILED" });
    expect(isRecord(body) && typeof body["requestId"] === "string").toBe(true);
  });

  it("rejects a class and section from another school", async () => {
    const response = await request(app, "/api/v1/students", {
      headers: {
        cookie,
        "X-Academic-Id": String(school.academicId),
        "X-Class-Id": String(other.classId),
        "X-Section-Id": String(other.sectionId)
      }
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "TENANT_MISMATCH" });
  });
});
