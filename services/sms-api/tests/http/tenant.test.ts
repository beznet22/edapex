import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, request, setPassword, testApp } from "./support/http";

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

const withHeaders = (headers: Record<string, string>): Promise<Response> =>
  request(app, "/api/v1/students", { headers });

describe("tenant scope", () => {
  it("returns the exact 422 body for a missing class and section", async () => {
    const response = await withHeaders({
      cookie,
      "X-Academic-Id": String(school.academicId)
    });
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"TENANT_SCOPE_REQUIRED","message":"Pick a class and section to continue."}'
    );
  });

  it("requires the academic header", async () => {
    const response = await withHeaders({ cookie });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("rejects an academic year from another school", async () => {
    const response = await withHeaders({
      cookie,
      "X-Academic-Id": String(other.academicId),
      "X-Class-Id": String(school.classId),
      "X-Section-Id": String(school.sectionId)
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "TENANT_MISMATCH" });
  });

  it("rejects a class and section from another school", async () => {
    const response = await withHeaders({
      cookie,
      "X-Academic-Id": String(school.academicId),
      "X-Class-Id": String(other.classId),
      "X-Section-Id": String(other.sectionId)
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "TENANT_MISMATCH" });
  });

  it("accepts the matching tenant", async () => {
    const response = await withHeaders({
      cookie,
      "X-Academic-Id": String(school.academicId),
      "X-Class-Id": String(school.classId),
      "X-Section-Id": String(school.sectionId)
    });
    expect(response.status).toBe(200);
  });
});
