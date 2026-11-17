import type { AuthConfigPort } from "../ports/auth-config.port";

export interface AuthConfigEnv {
  readonly CLAIM_ENABLED?: string;
  readonly CLAIM_LINK_ENABLED?: string;
  readonly CLAIM_PASSWORD_DIGEST?: string;
  readonly AUTH_COOKIE_SECRET?: string;
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly GOOGLE_REDIRECT_URI?: string;
  readonly POST_LOGIN_REDIRECT?: string;
  readonly MAGIC_LINK_TTL_SECONDS?: string;
  readonly SESSION_TTL_SECONDS?: string;
  readonly APP_ORIGIN?: string;
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
/**
 * The sign-in link lifetime.
 *
 * Bounded at both ends: below a minute is unusable, above 90 days is a credential with no
 * expiry in practice. An unparseable value falls back to production's 15 minutes rather than
 * failing open — a typo in an env var must not silently mint a 90-day token.
 */
const ttlOf = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  // Bounded at both ends: under a minute is unusable, over 90 days is a credential with no
  // expiry in practice. An unparseable value falls back rather than failing open.
  if (!Number.isInteger(parsed) || parsed < 60 || parsed > 60 * 60 * 24 * 90) return fallback;
  return parsed;
};

export function createAuthConfig(env: AuthConfigEnv): AuthConfigPort {
  const digest = present(env.CLAIM_PASSWORD_DIGEST);
  const cookieSecret = present(env.AUTH_COOKIE_SECRET);
  const configured =
    digest !== null && SHA256_HEX.test(digest.toLowerCase()) && cookieSecret !== null;
  const claimEnabled = env.CLAIM_ENABLED === "1" && configured;
  const claimLinkEnabled = env.CLAIM_LINK_ENABLED !== "0";

  const googleConfigured =
    present(env.GOOGLE_CLIENT_ID) !== null &&
    present(env.GOOGLE_CLIENT_SECRET) !== null &&
    present(env.GOOGLE_REDIRECT_URI) !== null;

  return Object.freeze({
    claimEnabled,
    claimDigest: claimEnabled && digest !== null ? digest.toLowerCase() : null,
    claimLinkEnabled,
    cookieSecret,
    googleConfigured,
    googleClientId: present(env.GOOGLE_CLIENT_ID),
    magicLinkTtlSeconds: ttlOf(env.MAGIC_LINK_TTL_SECONDS, 15 * 60),
    sessionTtlSeconds: ttlOf(env.SESSION_TTL_SECONDS, 7 * 24 * 60 * 60),
    postLoginRedirect: present(env.POST_LOGIN_REDIRECT) ?? "/",
    appOrigin: present(env.APP_ORIGIN) ?? "https://app.llacademy.ng"
  });
}
