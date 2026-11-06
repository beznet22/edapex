import { PortError } from "../errors";
import type {
  GoogleAuthorizeInput,
  GoogleExchangeInput,
  GoogleOAuthPort,
  GoogleProfile
} from "../ports/google-oauth.port";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPE = "openid email profile";

export type GoogleFetch = (url: string, init: RequestInit) => Promise<Response>;

export interface GoogleOAuthEnv {
  readonly GOOGLE_CLIENT_ID?: string;
  readonly GOOGLE_CLIENT_SECRET?: string;
  readonly GOOGLE_REDIRECT_URI?: string;
}

export interface GoogleOAuthDependencies {
  readonly fetch?: GoogleFetch;
}

const present = (value: string | undefined): string | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringField = (value: Record<string, unknown>, key: string): string | null => {
  const candidate = value[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : null;
};

const verifiedFlag = (value: unknown): boolean => value === true || value === "true";

const readJson = async (response: Response, port: string): Promise<Record<string, unknown>> => {
  if (!response.ok) {
    throw new PortError(port, `request failed with status ${response.status}`, true);
  }
  const payload: unknown = await response.json();
  if (!isRecord(payload)) {
    throw new PortError(port, "response was not a JSON object", false);
  }
  return payload;
};

/** `04 §3.2`: state + PKCE, two subrequests, and no D1 read until after them. */
export class GoogleOAuthAdapter implements GoogleOAuthPort {
  private readonly clientId: string | null;
  private readonly clientSecret: string | null;
  private readonly redirectUri: string | null;
  private readonly fetcher: GoogleFetch;

  constructor(env: GoogleOAuthEnv, dependencies: GoogleOAuthDependencies = {}) {
    this.clientId = present(env.GOOGLE_CLIENT_ID);
    this.clientSecret = present(env.GOOGLE_CLIENT_SECRET);
    this.redirectUri = present(env.GOOGLE_REDIRECT_URI);
    this.fetcher = dependencies.fetch ?? ((url, init) => fetch(url, init));
  }

  private requireConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
    if (this.clientId === null || this.clientSecret === null || this.redirectUri === null) {
      throw new PortError("google-oauth", "Google sign-in is not configured", false);
    }
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      redirectUri: this.redirectUri
    };
  }

  authorizeUrl(input: GoogleAuthorizeInput): string {
    const config = this.requireConfig();
    const url = new URL(AUTHORIZE_ENDPOINT);
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPE);
    url.searchParams.set("state", input.state);
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
    return url.toString();
  }

  async exchange(input: GoogleExchangeInput): Promise<GoogleProfile> {
    const config = this.requireConfig();
    const tokenResponse = await this.fetcher(TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: input.code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: input.codeVerifier
      }).toString()
    });
    const token = await readJson(tokenResponse, "google-oauth");
    const accessToken = stringField(token, "access_token");
    if (accessToken === null) {
      throw new PortError("google-oauth", "token response had no access_token", false);
    }

    const userinfoResponse = await this.fetcher(USERINFO_ENDPOINT, {
      method: "GET",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const userinfo = await readJson(userinfoResponse, "google-oauth");
    const providerUserId = stringField(userinfo, "sub");
    const email = stringField(userinfo, "email");
    if (providerUserId === null || email === null) {
      throw new PortError("google-oauth", "userinfo lacked sub or email", false);
    }

    return {
      providerUserId,
      email: email.toLowerCase(),
      emailVerified: verifiedFlag(userinfo["email_verified"]),
      name: stringField(userinfo, "name")
    };
  }
}

export function createGoogleOAuth(
  env: GoogleOAuthEnv,
  dependencies: GoogleOAuthDependencies = {}
): GoogleOAuthPort {
  return new GoogleOAuthAdapter(env, dependencies);
}
