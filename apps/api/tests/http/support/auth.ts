import type { AuthConfigPort, GoogleOAuthPort, GoogleProfile } from "../../../src/lib/server/services";
import { sha256Hex } from "../../../src/lib/server/services";

export const SHARED_CLAIM_PASSWORD = "shared-claim-password";
export const COOKIE_SECRET = "http-cookie-secret";

export const claimConfig = async (
  overrides: Partial<AuthConfigPort> = {}
): Promise<AuthConfigPort> => ({
  claimEnabled: true,
  claimDigest: await sha256Hex(SHARED_CLAIM_PASSWORD),
  legacyPasswordLogin: false,
  cookieSecret: COOKIE_SECRET,
  googleConfigured: true,
  postLoginRedirect: "/app",
  ...overrides
});

export const fakeGoogle = (profile: GoogleProfile): GoogleOAuthPort => ({
  authorizeUrl: ({ state, codeChallenge }) =>
    `https://accounts.example.test/o/oauth2/auth?state=${state}&code_challenge=${codeChallenge}`,
  exchange: async () => profile
});

/** Reads one cookie out of the concatenated Set-Cookie header. */
export const cookieValue = (response: Response, name: string): string | null => {
  const header = response.headers.get("set-cookie");
  if (header === null) return null;
  const match = header.match(new RegExp(`${name}=([^;]+)`));
  return match?.[1] ?? null;
};

export const cookiePair = (response: Response, name: string): string | null => {
  const value = cookieValue(response, name);
  return value === null ? null : `${name}=${value}`;
};

export const stateOf = (authorizeUrl: string): string | null =>
  new URL(authorizeUrl).searchParams.get("state");
