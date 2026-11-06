import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { PortError } from "../../src/lib/server/services/errors";
import type { EmailMessage, EmailSender } from "../../src/lib/server/services/ports";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { seedAssessmentResult } from "./support/assessment";
import {
  login,
  makeAdmin,
  request,
  setPassword,
  tenantHeaders,
  testApp
} from "./support/http";

const db = database(env);
const sentMessages: EmailMessage[] = [];
const fakeEmail: EmailSender = {
  async send(message) {
    sentMessages.push(message);
    return { messageId: "test-message" };
  }
};
const failingEmail: EmailSender = {
  async send() {
    throw new PortError("email", "smtp unavailable");
  }
};
const app = testApp({ email: fakeEmail });
const failingApp = testApp({ email: failingEmail });
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
  await seedAssessmentResult(school);
});

const publishResults = (
  targetApp: typeof app,
  body: Readonly<Record<string, unknown>>
): Promise<Response> =>
  request(targetApp, "/api/v1/assessments/publish/results", {
    method: "POST",
    headers: {
      ...tenantHeaders(school, cookie),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

const publishTranscript = (
  targetApp: typeof app,
  targetCookie: string,
  targetSchool: SeededSchool
): Promise<Response> =>
  request(targetApp, "/api/v1/assessments/publish/transcript", {
    method: "POST",
    headers: {
      ...tenantHeaders(targetSchool, targetCookie),
      "content-type": "application/json"
    },
    body: JSON.stringify({
      to: "parent@example.test",
      parentName: "Parent",
      studentName: "Student",
      academicYear: "2026/1"
    })
  });

describe("assessment publish routes", () => {
  it("publishes result emails without a success wrapper", async () => {
    const response = await publishResults(app, {
      examId: school.termId,
      studentIds: [school.studentId]
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      sent: 1,
      failed: 0,
      errors: [],
      results: [
        {
          studentId: school.studentId,
          to: "parent1@example.test",
          messageId: "test-message"
        }
      ]
    });
    expect(body).not.toHaveProperty("success");
    expect(sentMessages.at(-1)?.template).toBe("result");
  });

  it("skips an already-sent result unless resend is true", async () => {
    const duplicate = await publishResults(app, {
      examId: school.termId,
      studentIds: [school.studentId]
    });
    expect(duplicate.status).toBe(200);
    expect(await duplicate.json()).toMatchObject({
      sent: 0,
      failed: 1
    });

    const resent = await publishResults(app, {
      examId: school.termId,
      studentIds: [school.studentId],
      resend: true
    });
    expect(resent.status).toBe(200);
    expect(await resent.json()).toMatchObject({ sent: 1, failed: 0 });
  });

  it("maps an email port failure to 502", async () => {
    const response = await publishResults(failingApp, {
      examId: school.termId,
      studentIds: [school.studentId],
      resend: true
    });
    expect(response.status).toBe(502);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      error: "UPSTREAM_FAILURE",
      message: "An upstream service failed"
    });
    expect(JSON.stringify(body)).not.toContain("smtp");
  });

  it("emails a transcript as an administrator", async () => {
    const response = await publishTranscript(app, cookie, school);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toMatchObject({
      message: "Email sent successfully",
      messageId: "test-message"
    });
    expect(body).not.toHaveProperty("success");
  });

  it("rejects a non-administrator and a bad recipient", async () => {
    const forbidden = await publishTranscript(app, memberCookie, other);
    expect(forbidden.status).toBe(403);

    const invalid = await request(
      app,
      "/api/v1/assessments/publish/transcript",
      {
        method: "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        body: JSON.stringify({
          to: "not-an-email",
          parentName: "Parent",
          studentName: "Student",
          academicYear: "2026/1"
        })
      }
    );
    expect(invalid.status).toBe(400);
  });

  it("maps a transcript email failure to 502", async () => {
    const response = await publishTranscript(failingApp, cookie, school);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "UPSTREAM_FAILURE"
    });
  });
});
