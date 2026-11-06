/**
 * The transitional flags from `04a §1` and `§3`. `claimEnabled` is derived:
 * it requires the flag, a valid shared digest and a cookie secret. Enabling
 * claim forces the legacy password route off so the public digest cannot mint
 * a session without a Google link.
 */
export interface AuthConfigPort {
  readonly claimEnabled: boolean;
  readonly claimDigest: string | null;
  readonly legacyPasswordLogin: boolean;
  readonly cookieSecret: string | null;
  readonly googleConfigured: boolean;
  readonly postLoginRedirect: string;
}
