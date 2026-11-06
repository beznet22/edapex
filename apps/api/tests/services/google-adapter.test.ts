import { describe, expect, it } from "vitest";

import { createGoogleOAuth } from "../../src/lib/server/services";
import type { GoogleFetch } from "../../src/lib/server/services";

const ENV = {
  GOOGLE_CLIENT_ID: "client-id",
  GOOGLE_CLIENT_SECRET: "client-secret",
  GOOGLE_REDIRECT_URI: "https://api.example.test/api/v1/auth/google/callback"
};

describe("google oauth adapter", () => {
  it("builds an authorize URL with state, PKCE and the fixed redirect", () => {
    const adapter = createGoogleOAuth(ENV);
    const url = new URL(
      adapter.authorizeUrl({ state: "state-1", codeChallenge: "challenge-1" })
    );
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(ENV.GOOGLE_REDIRECT_URI);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("state")).toBe("state-1");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("exchanges the code and normalises verified userinfo", async () => {
    const calls: { readonly url: string; readonly init: RequestInit }[] = [];
    const fetcher: GoogleFetch = async (url, init) => {
      calls.push({ url, init });
      if (url.includes("token")) {
        return Response.json({ access_token: "access-1", token_type: "Bearer" });
      }
      return Response.json({
        sub: "google-1",
        email: "User@Example.test",
        email_verified: true,
        name: "User One"
      });
    };

    const adapter = createGoogleOAuth(ENV, { fetch: fetcher });
    await expect(
      adapter.exchange({ code: "code-1", codeVerifier: "verifier-1" })
    ).resolves.toEqual({
      providerUserId: "google-1",
      email: "user@example.test",
      emailVerified: true,
      name: "User One"
    });

    expect(calls).toHaveLength(2);
    expect(String(calls[0]?.init.body)).toContain("code_verifier=verifier-1");
    expect(String(calls[0]?.init.body)).toContain("grant_type=authorization_code");
    expect(calls[1]?.init.headers).toMatchObject({ authorization: "Bearer access-1" });
  });

  it("treats string email_verified and a missing name safely", async () => {
    const fetcher: GoogleFetch = async (url) =>
      url.includes("token")
        ? Response.json({ access_token: "access-2" })
        : Response.json({
            sub: "google-2",
            email: "second@example.test",
            email_verified: "true"
          });
    const adapter = createGoogleOAuth(ENV, { fetch: fetcher });
    await expect(
      adapter.exchange({ code: "code-2", codeVerifier: "verifier-2" })
    ).resolves.toEqual({
      providerUserId: "google-2",
      email: "second@example.test",
      emailVerified: true,
      name: null
    });
  });

  it("refuses to build a URL when unconfigured and surfaces upstream failures", async () => {
    const unconfigured = createGoogleOAuth({});
    expect(() => unconfigured.authorizeUrl({ state: "s", codeChallenge: "c" })).toThrow(
      /not configured/
    );

    const failing: GoogleFetch = async () => new Response("upstream", { status: 500 });
    const adapter = createGoogleOAuth(ENV, { fetch: failing });
    await expect(
      adapter.exchange({ code: "code", codeVerifier: "verifier" })
    ).rejects.toThrow(/status 500/);
  });
});
