import { describe, expect, it } from "vitest";

import { codeFromUrl, isHostFailure } from "./auth";

describe("auth deep links", () => {
  it("reads the code from the callback", () => {
    expect(codeFromUrl("edapex://auth?code=abc123")).toBe("abc123");
  });

  it("ignores a link that only looks like a callback", () => {
    expect(codeFromUrl("edapex://thread/auth?code=abc")).toBeNull();
    expect(codeFromUrl("https://api.llacademy.ng/auth?code=abc")).toBeNull();
  });

  it("rejects an empty or missing code", () => {
    expect(codeFromUrl("edapex://auth?code=")).toBeNull();
    expect(codeFromUrl("edapex://auth")).toBeNull();
    expect(codeFromUrl("not a url")).toBeNull();
  });
});

describe("host failures", () => {
  it("recognises the typed error the Rust commands reject with", () => {
    expect(isHostFailure({ code: "provider_unavailable", message: "x", retryable: true })).toBe(true);
    expect(isHostFailure({ code: "provider_unavailable" })).toBe(false);
    expect(isHostFailure("provider_unavailable")).toBe(false);
    expect(isHostFailure(null)).toBe(false);
  });
});
