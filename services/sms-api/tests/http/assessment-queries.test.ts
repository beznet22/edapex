import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { seedAssessmentResult } from "./support/assessment";
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
  await seedAssessmentResult(school);
});

describe("assessment query routes", () => {
  it("returns a marksheet by student id and by admission number", async () => {
    const byId = await request(
      app,
      `/api/v1/assessments/results/${school.studentId}/${school.termId}`,
      { headers: tenantHeaders(school, cookie) }
    );
    expect(byId.status).toBe(200);
    expect(await byId.json()).toMatchObject({
      student: { id: school.studentId },
      records: [{ subjectId: school.subjectId }]
    });

    const byAdmission = await request(
      app,
      `/api/v1/assessments/results/${school.studentId}/${school.termId}?byAdmission=true`,
      { headers: tenantHeaders(school, cookie) }
    );
    expect(byAdmission.status).toBe(200);
  });

  it("returns a transcript with only an academic scope", async () => {
    const response = await request(
      app,
      `/api/v1/assessments/transcripts/${school.studentId}/${school.academicId}`,
      {
        headers: {
          cookie,
          "X-Academic-Id": String(school.academicId)
        }
      }
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      terms: [{ examTypeId: school.termId }],
      yearlyTotal: 60
    });
  });

  it("returns 404 for a missing result or transcript", async () => {
    const result = await request(
      app,
      `/api/v1/assessments/results/999999/${school.termId}`,
      { headers: tenantHeaders(school, cookie) }
    );
    expect(result.status).toBe(404);
    expect(await result.json()).toMatchObject({ error: "NOT_FOUND" });

    const transcript = await request(
      app,
      `/api/v1/assessments/transcripts/999999/${school.academicId}`,
      {
        headers: {
          cookie,
          "X-Academic-Id": String(school.academicId)
        }
      }
    );
    expect(transcript.status).toBe(404);
  });

  it("rejects a non-numeric result identifier", async () => {
    const response = await request(
      app,
      `/api/v1/assessments/results/not-an-id/${school.termId}`,
      { headers: tenantHeaders(school, cookie) }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("requires the class scope for result reads", async () => {
    const response = await request(
      app,
      `/api/v1/assessments/results/${school.studentId}/${school.termId}`,
      {
        headers: {
          cookie,
          "X-Academic-Id": String(school.academicId)
        }
      }
    );
    expect(response.status).toBe(422);
    expect(JSON.stringify(await response.json())).toBe(
      '{"error":"TENANT_SCOPE_REQUIRED","message":"Pick a class and section to continue."}'
    );
  });
});
