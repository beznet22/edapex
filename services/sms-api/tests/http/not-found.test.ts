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

describe("not found", () => {
  it("returns the flat envelope for an unknown root path", async () => {
    const response = await request(app, "/totally-unknown");
    expect(response.status).toBe(404);
    const body: unknown = await response.json();
    expect(body).toMatchObject({ error: "NOT_FOUND" });
    expect(body).toHaveProperty("requestId");
  });

  it("returns 404 for an unknown authenticated API path", async () => {
    const response = await request(app, "/api/v1/unknown", {
      headers: tenantHeaders(school, cookie)
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: "NOT_FOUND" });
  });

  it("does not expose the retired auth aliases", async () => {
    for (const path of [
      "/api/v1/auth/signup",
      "/api/v1/auth/update-password",
      "/api/v1/auth/request-reset"
    ]) {
      const response = await request(app, path, {
        method: "POST",
        headers: {
          cookie,
          "content-type": "application/json"
        },
        body: "{}"
      });
      expect(response.status, path).toBe(404);
    }
  });
});
