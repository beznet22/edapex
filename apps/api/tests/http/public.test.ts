import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, request, setPassword, tenantHeaders, testApp } from "./support/http";

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

const dropped = [
  "/api/v1/parents/connect-telegram",
  "/api/v1/results/generate-pdf",
  "/api/v1/auth/claim",
  "/api/v1/auth/google/callback",
  "/api/v1/demo/admit"
];

describe("public surface", () => {
  it("serves health and the public photo route without a session", async () => {
    const health = await request(app, "/health");
    expect(health.status).toBe(200);

    const missingPhoto = await request(app, "/uploads/students/not-a-photo.png");
    expect(missingPhoto.status).toBe(404);
    expect(missingPhoto.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("keeps protected routes closed to anonymous callers", async () => {
    const me = await request(app, "/api/v1/me");
    expect(me.status).toBe(401);

    const students = await request(app, "/api/v1/students");
    expect(students.status).toBe(401);
  });

  it("does not expose the dropped service routes", async () => {
    for (const path of dropped) {
      const isGet = path.startsWith("/api/v1/auth/google");
      const init: RequestInit = {
        method: isGet ? "GET" : "POST",
        headers: {
          ...tenantHeaders(school, cookie),
          "content-type": "application/json"
        },
        ...(isGet ? {} : { body: "{}" })
      };
      const response = await request(app, path, init);
      expect(response.status, path).toBe(404);
    }
  });

  it("does not expose legacy root routes", async () => {
    for (const path of ["/api/commit", "/api/uploads", "/api/mentions/search", "/r/test"]) {
      const response = await request(app, path);
      expect(response.status, path).toBe(404);
    }
  });
});
