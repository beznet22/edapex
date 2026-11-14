import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import type { Marksheet } from "../../src/lib/schema/marksheet";
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
let marksheet: Marksheet;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "secret");
  cookie = await login(app, "user1@example.test", "secret");
  marksheet = await seedAssessmentResult(school);
});

describe("assessment entry routes", () => {
  it("commits a marksheet", async () => {
    const response = await request(app, "/api/v1/assessments/marksheets", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ marksheet })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      student: { id: school.studentId }
    });
  });

  it("rejects a marksheet with no records", async () => {
    const response = await request(app, "/api/v1/assessments/marksheets", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ marksheet: { ...marksheet, records: [] } })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("rejects unknown top-level keys", async () => {
    const response = await request(app, "/api/v1/assessments/marksheets", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ marksheet, extra: true })
    });
    expect(response.status).toBe(400);
  });

  it("upserts a student result", async () => {
    const response = await request(app, "/api/v1/assessments/results", {
      method: "PUT",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        studentData: {
          studentId: school.studentId,
          classId: school.classId,
          sectionId: school.sectionId,
          recordId: school.recordId,
          examTypeId: school.termId,
          studentCategory: "NURSERY"
        },
        marksData: [
          {
            subjectId: school.subjectId,
            marks: { CA: 30, EXAM: 50 }
          }
        ]
      })
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      studentId: school.studentId,
      examTypeId: school.termId,
      results: [{ subjectId: school.subjectId }]
    });
  });

  it("rejects an unknown student category", async () => {
    const response = await request(app, "/api/v1/assessments/results", {
      method: "PUT",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({
        studentData: {
          studentId: school.studentId,
          classId: school.classId,
          sectionId: school.sectionId,
          examTypeId: school.termId,
          studentCategory: "UNKNOWN"
        },
        marksData: [{ subjectId: school.subjectId, marks: { CA: 10 } }]
      })
    });
    expect(response.status).toBe(400);
  });
});
