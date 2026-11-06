import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, request, setPassword, testApp } from "./support/http";

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

describe("middleware order", () => {
  it("answers CORS preflight before auth", async () => {
    const response = await request(app, "/api/v1/me", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET"
      }
    });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    );
  });

  it("rejects an oversized body before auth", async () => {
    const padding = "x".repeat(1_100_000);
    const body = JSON.stringify({ active: true, padding });
    const response = await request(
      app,
      `/api/v1/students/${school.studentId}/status`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "content-length": String(body.length)
        },
        body
      }
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("rate-limits auth attempts before the handler", async () => {
    const ip = "203.0.113.77";
    let lastStatus = 0;
    let last: Response | null = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      last = await request(app, "/api/v1/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": ip
        },
        body: JSON.stringify({
          identifier: "nobody@example.test",
          password: "wrong"
        })
      });
      lastStatus = last.status;
    }
    expect(lastStatus).toBe(429);
    expect(last?.headers.get("retry-after")).not.toBeNull();
  });

  it("puts the request id on error responses", async () => {
    const response = await request(app, "/api/v1/me");
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).not.toBeNull();
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "UNAUTHENTICATED" });
  });

  it("keeps the authenticated surface reachable", async () => {
    const response = await request(app, "/api/v1/me", {
      headers: { cookie }
    });
    expect(response.status).toBe(200);
  });
});
