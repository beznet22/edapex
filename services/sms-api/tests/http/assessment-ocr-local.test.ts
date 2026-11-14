import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import type { OcrClient } from "../../src/lib/server/services/ports";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, request, tenantHeaders, testApp } from "./support/http";

let cloudCalls = 0;
const fakeOcr: OcrClient = {
  async extract() {
    cloudCalls += 1;
    return {
      markdown: "CA 10",
      annotation: null,
      pageCount: 1
    };
  }
};

const annotation = {
  student: {
    fullName: "Ada Okafor",
    admissionNo: "A-1",
    className: "G6",
    sectionName: "A",
    category: "MIDDLEBASIC",
    term: "Term 1",
    academicYear: "2026"
  },
  attendance: { daysOpened: 10, daysPresent: 9, daysAbsent: 1 },
  subjects: [
    {
      subjectCode: "MATH",
      marks: [{ title: "CA", value: 10 }],
      learningOutcome: null
    }
  ],
  ratings: [],
  remark: null
};

const db = database(env);
const app = testApp({ ocr: fakeOcr });
let school: SeededSchool;
let cookie: string;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  cookie = await login(app, "user1@example.test", "secret");
});

const localBody = {
  fileName: "capture.jpg",
  mimeType: "image/jpeg",
  rawText: "Ada Okafor\nMATH CA 10",
  annotation,
  pageCount: 1,
  engine: "rusto" as const,
  engineVersion: "0.3.2",
  meanConfidence: 0.94,
  warnings: []
};

const localExtract = () =>
  request(app, "/api/v1/assessments/ocr/local-extractions", {
    method: "POST",
    headers: {
      ...tenantHeaders(school, cookie),
      "content-type": "application/json"
    },
    body: JSON.stringify(localBody)
  });

describe("local OCR ingestion", () => {
  it("stores text/annotation without calling the cloud provider", async () => {
    cloudCalls = 0;
    const first = await localExtract();
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      provider: "rusto",
      isLocal: true,
      rawText: localBody.rawText,
      pageCount: 1,
      cached: false,
      warnings: []
    });
    expect(cloudCalls).toBe(0);

    const second = await localExtract();
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ cached: true });
    expect(cloudCalls).toBe(0);
  });

  it("rejects invalid local annotation", async () => {
    const response = await request(app, "/api/v1/assessments/ocr/local-extractions", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ ...localBody, annotation: { student: {} } })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });
});

describe("cloud OCR consent", () => {
  it("requires an explicit cloud consent header", async () => {
    const form = new FormData();
    form.set("file", new File(["same-bytes"], "scan.pdf", { type: "application/pdf" }));
    form.set("filename", "scan.pdf");

    const denied = await request(app, "/api/v1/assessments/ocr/extractions", {
      method: "POST",
      headers: tenantHeaders(school, cookie),
      body: form
    });
    expect(denied.status).toBe(400);

    const allowed = await request(app, "/api/v1/assessments/ocr/extractions", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "x-ocr-consent": "cloud"
      },
      body: form
    });
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ provider: "mistral", isLocal: false });
  });
});
