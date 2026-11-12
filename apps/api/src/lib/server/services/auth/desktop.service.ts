import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { sha256Base64Url, randomToken } from "../crypto/digest";
import { signPayload, verifyPayload } from "../crypto/signed-payload";
import { AuthError, ConflictError, ValidationError } from "../errors";
import { SessionService } from "./session.service";
import type { AuthSessionResult } from "./types";

export const DESKTOP_REDIRECT_URI = "edapex://auth";
export const DESKTOP_CODE_TTL_SECONDS = 5 * 60;
const PKCE_PATTERN = /^[A-Za-z0-9_-]{43,128}$/;

export interface DesktopCodePayload extends Record<string, unknown> {
  readonly kind: "desktop";
  readonly userId: number;
  readonly codeChallenge: string;
  readonly redirectUri: string;
  readonly jti: string;
  readonly exp: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isDesktopCodePayload = (value: unknown): value is DesktopCodePayload =>
  isRecord(value) &&
  value["kind"] === "desktop" &&
  typeof value["userId"] === "number" &&
  typeof value["codeChallenge"] === "string" &&
  PKCE_PATTERN.test(value["codeChallenge"]) &&
  value["redirectUri"] === DESKTOP_REDIRECT_URI &&
  typeof value["jti"] === "string" &&
  typeof value["exp"] === "number";

export class DesktopAuthService {
  constructor(private readonly ctx: ServiceContext) {}

  async createCode(
    userId: number,
    codeChallenge: string,
    redirectUri: string
  ): Promise<string> {
    const secret = this.ctx.ports.authConfig.cookieSecret;
    if (secret === null) {
      throw new ConflictError("Desktop sign-in is not configured");
    }
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new ValidationError("A positive user id is required", "userId");
    }
    if (!PKCE_PATTERN.test(codeChallenge)) {
      throw new ValidationError("A valid PKCE challenge is required", "codeChallenge");
    }
    if (redirectUri !== DESKTOP_REDIRECT_URI) {
      throw new ValidationError("The desktop redirect URI is not allowed", "redirectUri");
    }
    const now = this.ctx.ports.clock.now();
    return signPayload(
      secret,
      {
        kind: "desktop",
        userId,
        codeChallenge,
        redirectUri,
        jti: randomToken(18)
      },
      now + DESKTOP_CODE_TTL_SECONDS
    );
  }

  async exchange(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly ip: string | null;
    readonly userAgent: string | null;
  }): Promise<AuthSessionResult> {
    const secret = this.ctx.ports.authConfig.cookieSecret;
    if (secret === null) {
      throw new ConflictError("Desktop sign-in is not configured");
    }
    if (!PKCE_PATTERN.test(input.codeVerifier)) {
      throw new ValidationError("A valid PKCE verifier is required", "codeVerifier");
    }
    const now = this.ctx.ports.clock.now();
    const payload = await verifyPayload(
      secret,
      input.code,
      isDesktopCodePayload,
      now
    );
    if (payload === null) {
      throw new AuthError("This desktop sign-in code is invalid or expired");
    }
    const challenge = await sha256Base64Url(input.codeVerifier);
    if (challenge !== payload.codeChallenge) {
      throw new AuthError("The desktop sign-in verifier is invalid");
    }

    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const used = await this.ctx.repos.accounts.incrementRateLimit(
      unscoped,
      `desktop_code:${payload.jti}`,
      payload.exp
    );
    if (used > 1) {
      throw new AuthError("This desktop sign-in code has already been used");
    }

    const result = await new SessionService(this.ctx).issueForUser(payload.userId, {
      ip: input.ip,
      userAgent: input.userAgent,
      fingerprint: null
    });
    return result;
  }
}
