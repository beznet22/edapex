import { describe, expect, it } from "vitest";

import { app } from "../src/lib/server/http/app";

describe("GET /health", () => {
  it("returns the health payload", async () => {
    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("x-request-id")).not.toBeNull();

    const body: unknown = await response.json();
    expect(body).toEqual({ status: "ok" });
  });
});
