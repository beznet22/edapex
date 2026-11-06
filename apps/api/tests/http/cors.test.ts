import { describe, expect, it } from "vitest";

import { request, testApp } from "./support/http";

const app = testApp();

describe("CORS", () => {
  it("answers an allowlisted preflight with credentials and explicit headers", async () => {
    const response = await request(app, "/api/v1/me", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "content-type"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    );
    expect(response.headers.get("access-control-allow-credentials")).toBe("true");
    expect(response.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "X-Academic-Id"
    );
    expect(response.headers.get("access-control-allow-origin")).not.toBe("*");
    expect(response.headers.get("vary")).toContain("Origin");
  });

  it("does not add CORS headers for a non-allowlisted origin", async () => {
    const response = await request(app, "/api/v1/me", {
      method: "OPTIONS",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "GET"
      }
    });
    expect(response.headers.get("access-control-allow-origin")).toBeNull();
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
  });

  it("adds the allowlisted origin to actual responses", async () => {
    const response = await request(app, "/health", {
      headers: { origin: "http://localhost:5173" }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:5173"
    );
  });
});
