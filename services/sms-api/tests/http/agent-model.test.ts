import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, request, testApp } from "./support/http";

const app = testApp();
const db = database(env);
let school: SeededSchool;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
});

describe("model passthrough", () => {
  it("refuses an anonymous caller", async () => {
    const response = await request(app, "/api/v1/agent/model/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "openrouter/auto", messages: [] })
    });
    expect(response.status).toBe(401);
  });

  it("forwards a valid request without requiring a school scope", async () => {
    // The route sits outside the tenant middleware on purpose, so a workspace
    // with no school can still run an agent. Auth is still required: the point
    // is that a *missing* `X-Academic-Id` must not be the thing that rejects it.
    const cookie = await login(app, "user1@example.test", "secret");
    const response = await request(app, "/api/v1/agent/model/chat/completions", {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [{ role: "user", content: "hi" }]
      })
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    // The fixture is a real school with a real academic year, so a 200 here means
    // the route genuinely ran without `X-Academic-Id` rather than passing because
    // no tenant existed to require one.
    expect(school.academicId).toBeGreaterThan(0);
  });

  it("stamps the caller identity from the session, not the request", async () => {
    const cookie = await login(app, "user1@example.test", "secret");
    const response = await request(app, "/api/v1/agent/model/chat/completions", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/json",
        // A caller trying to impersonate must be ignored; the identity is taken
        // from the session and stamped by this route.
        "x-edapex-user-id": "99999",
        "x-edapex-school-id": "99999"
      },
      body: JSON.stringify({
        model: "openrouter/auto",
        messages: [{ role: "user", content: "hi" }]
      })
    });
    const text = await response.text();
    const forwarded = /"forwardedUser":"?(\d+)"?/.exec(text)?.[1];
    expect(response.status).toBe(200);
    // The spoofed ids are ignored and the session's own identity is stamped, so
    // the forwarded value must be the seeded user rather than the claimed one.
    expect(forwarded).toBe(String(school.userId));
    expect(forwarded).not.toBe("99999");
  });

  it("requires a tenant for the school-scoped agent routes", async () => {
    const cookie = await login(app, "user1@example.test", "secret");
    const response = await request(app, "/api/v1/agent/capabilities", {
      headers: { cookie }
    });
    // Contrast with the route above: the school pack genuinely needs a scope.
    expect(response.status).toBe(400);
  });

});
