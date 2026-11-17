import { AuthError } from "../errors";

/**
 * Verifying a native Google ID token.
 *
 * The browser flow never needed this: it holds an access token and asks Google's userinfo
 * endpoint who the person is. A native sign-in has no access token — only a signed JWT that
 * the app hands over — so the claims have to be verified here rather than believed.
 *
 * The checks and why each one exists:
 * - **signature**: RS256 against Google's published keys, resolved by `kid`. Without it the
 *   token is a JSON blob anyone can write.
 * - **issuer**: `accounts.google.com` in either of its two spellings. Another provider's
 *   token must not be accepted.
 * - **audience**: our web client id. An ID token minted for a different app is a token for a
 *   different app.
 * - **expiry**, with no glass of skew for `exp` but five minutes for `iat`, because a phone
 *   clock can be ahead and a token from the future is not usable evidence.
 * - **`email_verified`**: an unverified address is not an identity, and this app has no
 *   self-signup to send a verification link to.
 */

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const CLOCK_SKEW_SECONDS = 300;

export interface GoogleIdClaims {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
}

export type JwksResolver = (kid: string) => Promise<JsonWebKey | null>;

interface JwtHeader {
  readonly alg?: unknown;
  readonly kid?: unknown;
}

interface JwtPayload {
  readonly iss?: unknown;
  readonly aud?: unknown;
  readonly exp?: unknown;
  readonly iat?: unknown;
  readonly sub?: unknown;
  readonly email?: unknown;
  readonly email_verified?: unknown;
  readonly name?: unknown;
}

const decoder = new TextDecoder();

function base64UrlBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function parseSegment<T>(segment: string, part: string): T {
  try {
    return JSON.parse(decoder.decode(base64UrlBytes(segment))) as T;
  } catch {
    throw new AuthError(`The Google token's ${part} is not valid JSON`);
  }
}

export async function verifyGoogleIdToken(input: {
  readonly token: string;
  readonly resolveKey: JwksResolver;
  readonly audience: string;
  readonly nowSeconds: number;
}): Promise<GoogleIdClaims> {
  const segments = input.token.split(".");
  if (segments.length !== 3) throw new AuthError("The Google token is not a JWT");
  const [encodedHeader, encodedPayload, encodedSignature] = segments as [string, string, string];

  const header = parseSegment<JwtHeader>(encodedHeader, "header");
  if (header.alg !== "RS256") throw new AuthError("The Google token is not signed with RS256");
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    throw new AuthError("The Google token has no key id");
  }

  const jwk = await input.resolveKey(header.kid);
  if (jwk === null) throw new AuthError("The Google token is signed with an unknown key");

  let key: CryptoKey;
  try {
    key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
  } catch {
    throw new AuthError("The Google signing key is unusable");
  }

  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlBytes(encodedSignature),
    signed
  );
  if (!valid) throw new AuthError("The Google token's signature does not match");

  const payload = parseSegment<JwtPayload>(encodedPayload, "payload");

  if (typeof payload.iss !== "string" || !GOOGLE_ISSUERS.has(payload.iss)) {
    throw new AuthError("The Google token was not issued by Google");
  }

  const audiences = Array.isArray(payload.aud)
    ? payload.aud.filter((value): value is string => typeof value === "string")
    : typeof payload.aud === "string"
      ? [payload.aud]
      : [];
  if (!audiences.includes(input.audience)) {
    throw new AuthError("The Google token was issued for a different app");
  }

  if (typeof payload.exp !== "number" || payload.exp <= input.nowSeconds) {
    throw new AuthError("The Google token has expired");
  }
  if (typeof payload.iat === "number" && payload.iat > input.nowSeconds + CLOCK_SKEW_SECONDS) {
    throw new AuthError("The Google token was issued in the future");
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new AuthError("The Google token has no subject");
  }
  if (typeof payload.email !== "string" || payload.email.length === 0) {
    throw new AuthError("The Google token has no email");
  }
  if (payload.email_verified !== true) {
    throw new AuthError("This Google address is not verified");
  }

  return {
    subject: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: typeof payload.name === "string" ? payload.name : null
  };
}
