import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

import type { WebFetchClient, WebSearchClient } from "../../src/lib/server/services";
import { database, seedTwoSchools } from "../support/seed";
import type { SeededSchool } from "../support/seed";
import { login, request, tenantHeaders, testApp } from "./support/http";

const search: WebSearchClient = {
  configured: true,
  async search(input) {
    return {
      provider: "tinyfish",
      results: [
        {
          title: "Result",
          url: "https://example.test/result",
          snippet: input.query,
          rank: 1
        }
      ]
    };
  }
};

const fetchPage: WebFetchClient = {
  configured: true,
  async fetch(input) {
    return {
      provider: "tavily",
      url: input.url,
      finalUrl: input.url,
      title: "Page",
      content: "# Page",
      format: input.format,
      bytes: 6,
      truncated: false
    };
  }
};

const app = testApp({ webSearch: search, webFetch: fetchPage });
const db = database(env);
let school: SeededSchool;
let cookie: string;

beforeAll(async () => {
  const [first] = await seedTwoSchools(db);
  school = first;
  cookie = await login(app, "user1@example.test", "secret");
});

describe("agent web routes", () => {
  it("returns platform capabilities for staff", async () => {
    const response = await request(app, "/api/v1/agent/platform-capabilities", {
      headers: tenantHeaders(school, cookie)
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      webSearch: true,
      webFetch: true,
      cloudOcr: true
    });
  });

  it("searches and fetches through the configured providers", async () => {
    const searched = await request(app, "/api/v1/agent/web/search", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ query: "fractions" })
    });
    expect(searched.status).toBe(200);
    expect(await searched.json()).toMatchObject({
      provider: "tinyfish",
      query: "fractions",
      results: [{ title: "Result" }]
    });

    const fetched = await request(app, "/api/v1/agent/web/fetch", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: "https://example.test/page" })
    });
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({
      provider: "tavily",
      finalUrl: "https://example.test/page",
      content: "# Page"
    });
  });

  it("rejects local and private fetch targets", async () => {
    const response = await request(app, "/api/v1/agent/web/fetch", {
      method: "POST",
      headers: {
        ...tenantHeaders(school, cookie),
        "content-type": "application/json"
      },
      body: JSON.stringify({ url: "http://127.0.0.1/admin" })
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "VALIDATION_FAILED" });
  });
});
