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

const put = (
  path: string,
  body: Readonly<Record<string, unknown>>
): Promise<Response> =>
  request(app, path, {
    method: "PUT",
    headers: {
      ...tenantHeaders(school, cookie),
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

describe("assessment feedback routes", () => {
  it("writes a teacher remark and student ratings", async () => {
    const remark = await put("/api/v1/assessments/feedback/remarks", {
      studentId: school.studentId,
      examTypeId: school.termId,
      remark: "A steady term."
    });
    expect(remark.status).toBe(204);

    const ratings = await put("/api/v1/assessments/feedback/ratings", {
      studentId: school.studentId,
      examTypeId: school.termId,
      ratings: { Punctuality: 4, Neatness: 5, Participation: null }
    });
    expect(ratings.status).toBe(204);
  });

  it("rejects an out-of-range rating and unknown keys", async () => {
    const badRating = await put("/api/v1/assessments/feedback/ratings", {
      studentId: school.studentId,
      examTypeId: school.termId,
      ratings: { Punctuality: 6 }
    });
    expect(badRating.status).toBe(400);

    const unknownKey = await put("/api/v1/assessments/feedback/remarks", {
      studentId: school.studentId,
      examTypeId: school.termId,
      remark: "ok",
      extra: true
    });
    expect(unknownKey.status).toBe(400);
  });
});
