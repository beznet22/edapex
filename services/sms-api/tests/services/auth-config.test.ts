import { describe, expect, it } from "vitest";

import { createAuthConfig } from "../../src/lib/server/services";

const DIGEST = "a".repeat(64);

describe("auth config", () => {
  it("keeps the cutover off by default", () => {
    const config = createAuthConfig({});
    expect(config.claimEnabled).toBe(false);
    expect(config.claimDigest).toBeNull();
    expect(config.googleConfigured).toBe(false);
    expect(config.postLoginRedirect).toBe("/");
  });

  it("enables claim only with the flag, a valid digest and a cookie secret", () => {
    const config = createAuthConfig({
      CLAIM_ENABLED: "1",
      CLAIM_PASSWORD_DIGEST: DIGEST.toUpperCase(),
      AUTH_COOKIE_SECRET: "secret"
    });
    expect(config.claimEnabled).toBe(true);
    expect(config.claimDigest).toBe(DIGEST);
  });

  it("fails closed when the digest is invalid or the secret is missing", () => {
    expect(
      createAuthConfig({
        CLAIM_ENABLED: "1",
        CLAIM_PASSWORD_DIGEST: "not-a-digest",
        AUTH_COOKIE_SECRET: "secret"
      }).claimEnabled
    ).toBe(false);

    expect(
      createAuthConfig({
        CLAIM_ENABLED: "1",
        CLAIM_PASSWORD_DIGEST: DIGEST
      }).claimEnabled
    ).toBe(false);
  });

  it("requires all three Google settings", () => {
    expect(
      createAuthConfig({
        GOOGLE_CLIENT_ID: "id",
        GOOGLE_CLIENT_SECRET: "secret",
        GOOGLE_REDIRECT_URI: "https://example.test/callback"
      }).googleConfigured
    ).toBe(true);
    expect(
      createAuthConfig({ GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "secret" })
        .googleConfigured
    ).toBe(false);
  });
});
