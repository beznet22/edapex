import { beforeAll, describe, expect, it } from "vitest";

import {
  verifyGoogleIdToken,
  type JwksResolver
} from "../../src/lib/server/services/auth/google-id-token";

const AUDIENCE = "test-client.apps.googleusercontent.com";
const NOW = 1_800_000_000;

let keyPair: CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string };

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const encode = (value: unknown): string =>
  b64url(new TextEncoder().encode(JSON.stringify(value)));

async function sign(
  payload: Record<string, unknown>,
  options: { header?: Record<string, unknown>; key?: CryptoKey } = {}
): Promise<string> {
  const header = options.header ?? { alg: "RS256", kid: "k1", typ: "JWT" };
  const signed = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    options.key ?? keyPair.privateKey,
    new TextEncoder().encode(signed)
  );
  return `${signed}.${b64url(new Uint8Array(signature))}`;
}

const resolve: JwksResolver = async (kid) => (kid === "k1" ? publicJwk : null);

const claims = (overrides: Record<string, unknown> = {}) => ({
  iss: "https://accounts.google.com",
  aud: AUDIENCE,
  sub: "google-subject-1",
  email: "Teacher@School.ng",
  email_verified: true,
  name: "A Teacher",
  iat: NOW - 30,
  exp: NOW + 600,
  ...overrides
});

const verify = (token: string) =>
  verifyGoogleIdToken({ token, resolveKey: resolve, audience: AUDIENCE, nowSeconds: NOW });

beforeAll(async () => {
  keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  publicJwk = { ...(await crypto.subtle.exportKey("jwk", keyPair.publicKey)), kid: "k1" };
});

describe("Google ID tokens", () => {
  it("accepts a token signed by Google for this app, and lowercases the email", async () => {
    await expect(verify(await sign(claims()))).resolves.toEqual({
      subject: "google-subject-1",
      email: "teacher@school.ng",
      emailVerified: true,
      name: "A Teacher"
    });
  });

  it("rejects a token minted for a different app", async () => {
    await expect(verify(await sign(claims({ aud: "someone-else.apps.googleusercontent.com" })))).rejects.toThrow(
      /different app/
    );
  });

  it("rejects an expired token even when the signature is good", async () => {
    await expect(verify(await sign(claims({ exp: NOW - 1 })))).rejects.toThrow(/expired/);
  });

  it("rejects a payload altered after signing", async () => {
    const token = await sign(claims());
    const [header, , signature] = token.split(".");
    const forged = `${header}.${encode(claims({ email: "attacker@example.com" }))}.${signature}`;
    await expect(verify(forged)).rejects.toThrow(/signature/);
  });

  it("rejects an unsigned token rather than reading its claims", async () => {
    const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode(claims())}.`;
    await expect(verify(unsigned)).rejects.toThrow(/RS256/);
  });

  it("rejects a key id it does not know", async () => {
    const token = await sign(claims(), { header: { alg: "RS256", kid: "rotated", typ: "JWT" } });
    await expect(verify(token)).rejects.toThrow(/unknown key/);
  });

  it("rejects another provider's issuer", async () => {
    await expect(verify(await sign(claims({ iss: "https://evil.example" })))).rejects.toThrow(
      /issued by Google/
    );
  });

  it("rejects an unverified address, because there is no self-signup to verify it later", async () => {
    await expect(verify(await sign(claims({ email_verified: false })))).rejects.toThrow(
      /not verified/
    );
  });

  it("rejects a token from the future beyond the clock skew", async () => {
    await expect(verify(await sign(claims({ iat: NOW + 3600 })))).rejects.toThrow(/future/);
  });
});
