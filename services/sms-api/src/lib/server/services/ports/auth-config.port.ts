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
  /**
   * How long a sign-in link stays valid, in seconds.
   *
   * 15 minutes in production; `.dev.vars` raises it, because a link that expires while you
   * are still reading the error you were about to fix is a link you request again.
   */
  readonly magicLinkTtlSeconds: number;
}
