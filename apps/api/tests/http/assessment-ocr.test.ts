import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import type { OcrClient } from "../../src/lib/server/services/ports";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import {
  login,
  makeAdmin,
  request,
  setPassword,
  stringField,
  tenantHeaders,
  testApp
} from "./support/http";

let calls = 0;
const fakeOcr: OcrClient = {
  async extract() {
    calls += 1;
    return {
      markdown: "# OCR\nCA 10",
      annotation: null,
      pageCount: 1
    };
  }
};

const db = database(env);
const app = testApp({ ocr: fakeOcr });
let school: SeededSchool;
let other: SeededSchool;
let cookie: string;
let memberCookie: string;

beforeAll(async () => {
  const schools = await seedTwoSchools(db);
  school = schools[0];
  other = schools[1];
  await setPassword(school, "secret");
  await setPassword(other, "secret");
  await makeAdmin(school);
  cookie = await login(app, "user1@example.test", "secret");
  memberCookie = await login(app, "user2@example.test", "secret");
});

const extract = (): Promise<Response> => {
  const form = new FormData();
  form.set("file", new File(["same-bytes"], "scan.pdf", { type: "application/pdf" }));
  form.set("filename", "scan.pdf");
  return request(app, "/api/v1/assessments/ocr/extractions", {
    method: "POST",
    headers: {
      cookie,
      "X-Academic-Id": String(school.academicId)
    },
    body: form
  });
};

describe("assessment OCR routes", () => {
  it("extracts and caches identical bytes", async () => {
    const first = await extract();
    expect(first.status).toBe(200);
    const firstBody: unknown = await first.json();
    expect(firstBody).toMatchObject({
      rawText: "# OCR\nCA 10",
      pageCount: 1,
      cached: false
    });
    expect(stringField(firstBody, "contentHash")).toMatch(/^[a-f0-9]{64}$/);

    const second = await extract();
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ cached: true });
    expect(calls).toBe(1);
  });

  it("rejects a missing file", async () => {
    const response = await request(
      app,
      "/api/v1/assessments/ocr/extractions",
      {
        method: "POST",
        headers: {
          cookie,
          "X-Academic-Id": String(school.academicId)
        },
        body: new FormData()
      }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("purges the cache as an administrator only", async () => {
    const admin = await request(app, "/api/v1/assessments/ocr/cache", {
      method: "DELETE",
      headers: {
        cookie,
        "X-Academic-Id": String(school.academicId)
      }
    });
    expect(admin.status).toBe(200);
    expect(await admin.json()).toHaveProperty("purged");

    const member = await request(app, "/api/v1/assessments/ocr/cache", {
      method: "DELETE",
      headers: {
        ...tenantHeaders(other, memberCookie)
      }
    });
    expect(member.status).toBe(403);
  });
});
