import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import type { OcrClient } from "../../src/lib/server/services/ports";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { seedAssessmentResult } from "./support/assessment";
import {
  isRecord,
  login,
  request,
  setPassword,
  stringField,
  tenantHeaders,
  testApp
} from "./support/http";

const fakeOcr: OcrClient = {
  async extract() {
    return { markdown: "# OCR", annotation: null, pageCount: 1 };
  }
};

const db = database(env);
const app = testApp({ ocr: fakeOcr });
let school: SeededSchool;
let cookie: string;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "secret");
  cookie = await login(app, "user1@example.test", "secret");
  await seedAssessmentResult(school);
});

const capture = (): Promise<Response> => {
  const form = new FormData();
  form.set("file", new File(["capture-bytes"], "marks.pdf", { type: "application/pdf" }));
  form.set("filename", "marks.pdf");
  form.set("examTypeId", String(school.termId));
  return request(app, "/api/v1/assessments/captures", {
    method: "POST",
    headers: tenantHeaders(school, cookie),
    body: form
  });
};

describe("assessment capture routes", () => {
  it("creates a capture and confirms its student", async () => {
    const created = await capture();
    expect(created.status).toBe(201);
    const createdBody: unknown = await created.json();
    if (!isRecord(createdBody) || !isRecord(createdBody["capture"])) {
      throw new Error("capture response has no capture");
    }
    const captureId = stringField(createdBody["capture"], "id");
    if (captureId === null) throw new Error("capture has no id");
    expect(createdBody["capture"]).toMatchObject({
      classId: school.classId,
      sectionId: school.sectionId,
      academicId: school.academicId,
      examTypeId: school.termId,
      studentId: null
    });

    const confirmed = await request(
      app,
      `/api/v1/assessments/captures/${captureId}/confirmation`,
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({ studentId: school.studentId })
      }
    );
    expect(confirmed.status).toBe(200);
    expect(await confirmed.json()).toMatchObject({
      id: captureId,
      studentId: school.studentId,
      status: "confirmed"
    });
  });

  it("rejects a missing file", async () => {
    const response = await request(app, "/api/v1/assessments/captures", {
      method: "POST",
      headers: tenantHeaders(school, cookie),
      body: new FormData()
    });
    expect(response.status).toBe(400);
  });

  it("returns 400 for an unknown capture", async () => {
    const response = await request(
      app,
      "/api/v1/assessments/captures/does-not-exist/confirmation",
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({ studentId: school.studentId })
      }
    );
    expect(response.status).toBe(400);
  });
});
