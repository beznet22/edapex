import type { AuthConfigPort } from "../ports/auth-config.port";

export interface AuthConfigEnv {
  readonly CLAIM_ENABLED?: string;
  readonly CLAIM_PASSWORD_DIGEST?: string;
  readonly LEGACY_PASSWORD_LOGIN?: string;
  readonly AUTH_COOKIE_SECRET?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly GOOGLE_REDIRECT_URI?: string;
  readonly POST_LOGIN_REDIRECT?: string;
}

const SHA256_HEX = /^[0-9a-f]{64}$/;

const present = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

/**
 * One place decides whether the transitional surfaces exist. A missing digest
 * or cookie secret disables claim rather than failing open (`04a §1`).
 */
export function createAuthConfig(env: AuthConfigEnv): AuthConfigPort {
  const digest = present(env.CLAIM_PASSWORD_DIGEST);
  const cookieSecret = present(env.AUTH_COOKIE_SECRET);
  const configured =
    digest !== null && SHA256_HEX.test(digest.toLowerCase()) && cookieSecret !== null;
  const claimEnabled = env.CLAIM_ENABLED === "1" && configured;

  const googleConfigured =
    present(env.GOOGLE_CLIENT_ID) !== null &&
    present(env.GOOGLE_CLIENT_SECRET) !== null &&
    present(env.GOOGLE_REDIRECT_URI) !== null;

  return Object.freeze({
    claimEnabled,
    claimDigest: claimEnabled && digest !== null ? digest.toLowerCase() : null,
    legacyPasswordLogin: claimEnabled ? false : env.LEGACY_PASSWORD_LOGIN !== "0",
    cookieSecret,
    googleConfigured,
    postLoginRedirect: present(env.POST_LOGIN_REDIRECT) ?? "/"
  });
}
