/**
 * The transitional flags from `04a §1` and `§3`. `claimEnabled` is derived:
 * it requires the flag, a valid shared digest and a cookie secret. Enabling
 * Password verification is not part of the target auth model.
 */
export interface AuthConfigPort {
  readonly claimEnabled: boolean;
  readonly claimDigest: string | null;
  readonly claimLinkEnabled: boolean;
  readonly cookieSecret: string | null;
  readonly googleConfigured: boolean;
  readonly postLoginRedirect: string;
  readonly appOrigin: string;
}
