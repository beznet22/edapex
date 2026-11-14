export interface GoogleAuthorizeInput {
  readonly state: string;
  readonly codeChallenge: string;
}

export interface GoogleExchangeInput {
  readonly code: string;
  readonly codeVerifier: string;
}

export interface GoogleProfile {
  readonly providerUserId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
}

/**
 * `04 §3.2`: one authorize URL and two subrequests (token + userinfo). The
 * adapter holds the client credentials and the fixed redirect URI so services
 * never see HTTP or env.
 */
export interface GoogleOAuthPort {
  authorizeUrl(input: GoogleAuthorizeInput): string;
  exchange(input: GoogleExchangeInput): Promise<GoogleProfile>;
}
