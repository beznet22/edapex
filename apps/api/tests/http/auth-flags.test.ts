import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { request, setPassword, testApp } from "./support/http";
import { SHARED_CLAIM_PASSWORD, claimConfig } from "./support/auth";

const db = database(env);
let school: SeededSchool;

const loginBody = {
  "content-type": "application/json"
};

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  await setPassword(school, "legacy-secret");
});

describe("transitional auth flags", () => {
  it("keeps the cutover routes absent by default", async () => {
    const app = testApp();
    expect((await request(app, "/api/v1/auth/claim", {
      method: "POST",
      headers: loginBody,
      body: JSON.stringify({ email: "user1@example.test", password: "legacy-secret" })
    })).status).toBe(404);
    expect((await request(app, "/api/v1/auth/google/start")).status).toBe(404);
  });

  it("keeps legacy password login available while claim is off", async () => {
    const app = testApp();
    const response = await request(app, "/api/v1/auth/login", {
      method: "POST",
      headers: loginBody,
      body: JSON.stringify({ identifier: "user1@example.test", password: "legacy-secret" })
    });
    expect(response.status).toBe(200);
  });

  it("retires legacy password login when claim is enabled", async () => {
    const config = await claimConfig({ legacyPasswordLogin: false });
    const app = testApp({ authConfig: config });

    const login = await request(app, "/api/v1/auth/login", {
      method: "POST",
      headers: loginBody,
      body: JSON.stringify({ identifier: "user1@example.test", password: "legacy-secret" })
    });
    expect(login.status).toBe(403);
    expect(await login.json()).toMatchObject({ error: "PASSWORD_LOGIN_RETIRED" });

    const mobile = await request(app, "/api/v1/auth/mobile/login", {
      method: "POST",
      headers: loginBody,
      body: JSON.stringify({ identifier: "user1@example.test", password: "legacy-secret" })
    });
    expect(mobile.status).toBe(403);
    expect(await mobile.json()).toMatchObject({ error: "PASSWORD_LOGIN_RETIRED" });
  });

  it("answers claim with the shared 202 shape only when enabled", async () => {
    const app = testApp({ authConfig: await claimConfig() });
    const response = await request(app, "/api/v1/auth/claim", {
      method: "POST",
      headers: loginBody,
      body: JSON.stringify({
        email: "nobody@example.test",
        password: SHARED_CLAIM_PASSWORD
      })
    });
    expect(response.status).toBe(202);
  });
});
