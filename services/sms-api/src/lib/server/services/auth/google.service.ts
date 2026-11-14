import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { randomToken, sha256Base64Url, sha256Hex } from "../crypto/digest";
import {
  AmbiguousEmailError,
  AuthError,
  ConflictError,
  LinkEmailUnverifiedError,
  PermissionError
} from "../errors";
import type { GoogleProfile } from "../ports/google-oauth.port";
import { emitAuthEvent } from "./auth-events";
import { completeClaim } from "./claim-link";
import { OAUTH_STATE_TTL_SECONDS } from "./claim-policy";
import { issueSession, loadAuthUser } from "./session-issuance";
import { signPayload } from "../crypto/signed-payload";
import { SESSION_TTL_SECONDS } from "./types";
import type { AuthSessionResult } from "./types";

export type GooglePurpose = "signin" | "claim" | "desktop";

export interface DesktopOAuthStart {
  readonly codeChallenge: string;
  readonly redirectUri: string;
}

export interface GoogleStartInput {
  readonly purpose: GooglePurpose;
  readonly claimUserId: number | null;
  readonly allowEmailChange?: boolean;
  readonly claimLinkId?: string | null;
  readonly desktop?: DesktopOAuthStart | null;
}

export interface GoogleStartResult {
  readonly authorizeUrl: string;
  readonly oauthCookie: string;
  readonly expiresAt: number;
}

export interface GoogleCallbackInput {
  readonly code: string;
  readonly codeVerifier: string;
  readonly purpose: GooglePurpose;
  readonly claimUserId: number | null;
  readonly allowEmailChange?: boolean;
  readonly claimLinkId?: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly fingerprint: string | null;
}

export interface GoogleStatePayload extends Record<string, unknown> {
  readonly purpose: GooglePurpose;
  readonly userId: number | null;
  readonly allowEmailChange: boolean;
  readonly claimLinkId: string | null;
  readonly desktopCodeChallenge: string | null;
  readonly desktopRedirectUri: string | null;
  readonly state: string;
  readonly verifier: string;
  readonly exp: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isGoogleStatePayload = (value: unknown): value is GoogleStatePayload =>
  isRecord(value) &&
  (value["purpose"] === "signin" ||
    value["purpose"] === "claim" ||
    value["purpose"] === "desktop") &&
  (value["userId"] === null || typeof value["userId"] === "number") &&
  typeof value["allowEmailChange"] === "boolean" &&
  (value["claimLinkId"] === null || typeof value["claimLinkId"] === "string") &&
  (value["desktopCodeChallenge"] === null ||
    typeof value["desktopCodeChallenge"] === "string") &&
  (value["desktopRedirectUri"] === null ||
    typeof value["desktopRedirectUri"] === "string") &&
  typeof value["state"] === "string" &&
  typeof value["verifier"] === "string" &&
  typeof value["exp"] === "number";

export class GoogleService {
  constructor(private readonly ctx: ServiceContext) {}

  async start(input: GoogleStartInput): Promise<GoogleStartResult> {
    const config = this.ctx.ports.authConfig;
    if (!config.googleConfigured || config.cookieSecret === null) {
      throw new ConflictError("Google sign-in is not configured");
    }

    const now = this.ctx.ports.clock.now();
    const state = randomToken(32);
    const verifier = randomToken(32);
    const codeChallenge = await sha256Base64Url(verifier);
    const expiresAt = now + OAUTH_STATE_TTL_SECONDS;
    const oauthCookie = await signPayload(
      config.cookieSecret,
      {
        purpose: input.purpose,
        userId: input.claimUserId,
        allowEmailChange: input.allowEmailChange === true,
        claimLinkId: input.claimLinkId ?? null,
        desktopCodeChallenge: input.desktop?.codeChallenge ?? null,
        desktopRedirectUri: input.desktop?.redirectUri ?? null,
        state,
        verifier
      },
      expiresAt
    );

    return {
      authorizeUrl: this.ctx.ports.google.authorizeUrl({ state, codeChallenge }),
      oauthCookie,
      expiresAt
    };
  }

  async callback(input: GoogleCallbackInput): Promise<AuthSessionResult> {
    const profile = await this.ctx.ports.google.exchange({
      code: input.code,
      codeVerifier: input.codeVerifier
    });

    if (!profile.emailVerified) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "google_signin",
          email: profile.email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "email_unverified" }
        },
        this.ctx.ports.clock.now()
      );
      throw new LinkEmailUnverifiedError();
    }

    if (input.purpose === "claim") {
      if (input.claimUserId === null) {
        throw new AuthError("The claim ticket is missing or expired");
      }
      return completeClaim(this.ctx, {
        userId: input.claimUserId,
        profile,
        allowEmailChange: input.allowEmailChange === true,
        claimLinkId: input.claimLinkId ?? null,
        ip: input.ip,
        userAgent: input.userAgent,
        fingerprint: input.fingerprint
      });
    }

    return this.signIn(profile, input);
  }

  /** `04 §3.2`: identity first, then a unique verified email. No self-signup. */
  private async signIn(
    profile: GoogleProfile,
    input: GoogleCallbackInput
  ): Promise<AuthSessionResult> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const identity = await this.ctx.repos.accounts.findIdentity(
      unscoped,
      "google",
      profile.providerUserId
    );

    if (identity !== null) {
      const user = await this.ctx.repos.accounts.findUserById(unscoped, identity.userId);
      if (user === null || user.activeStatus !== 1) {
        throw new AuthError("This account is not active");
      }
      if (user.claimStatus === "flagged") {
        throw new ConflictError(
          "This account is under administrative review; contact the school administrator"
        );
      }
      await this.ctx.repos.accounts.touchIdentityUsed(unscoped, identity.id, now);
      const session = await issueSession(this.ctx, user.id, {
        ip: input.ip,
        userAgent: input.userAgent,
        fingerprint: input.fingerprint
      });
      await emitAuthEvent(
        this.ctx,
        {
          type: "google_signin",
          userId: user.id,
          email: profile.email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "existing_identity" }
        },
        now
      );
      return { ...session, user: await loadAuthUser(this.ctx, user) };
    }

    const matches = await this.ctx.repos.accounts.listUsersByEmail(unscoped, profile.email);
    if (matches.length === 0) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "google_signin",
          email: profile.email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "no_account" }
        },
        now
      );
      throw new PermissionError("Accounts are provisioned by the school, not self-registered");
    }
    if (matches.length > 1) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "google_signin",
          email: profile.email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "ambiguous" }
        },
        now
      );
      throw new AmbiguousEmailError(profile.email);
    }

    const user = matches[0];
    if (user === undefined) throw new AuthError("Invalid credentials");
    if (user.activeStatus !== 1) throw new AuthError("This account is not active");
    if (user.claimStatus === "flagged") {
      throw new ConflictError(
        "This account is under administrative review; contact the school administrator"
      );
    }
    if (user.password !== null) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "google_signin",
          userId: user.id,
          email: profile.email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "claim_required" }
        },
        now
      );
      throw new ConflictError("Claim this account before linking Google");
    }

    const token = randomToken();
    const sessionId = crypto.randomUUID();
    const expiresAt = now + SESSION_TTL_SECONDS;
    await this.ctx.repos.accounts.completeClaimLink(unscoped, {
      userId: user.id,
      identity: {
        id: crypto.randomUUID(),
        userId: user.id,
        provider: "google",
        providerUserId: profile.providerUserId,
        emailAtProvider: profile.email,
        emailVerified: 1,
        createdAt: now,
        lastUsedAt: now
      },
      session: {
        id: sessionId,
        userId: user.id,
        tokenHash: await sha256Hex(token),
        expiresAt,
        deviceFingerprint: input.fingerprint,
        createdAt: now
      },
      email: profile.email,
      now
    });
    await emitAuthEvent(
      this.ctx,
      {
        type: "identity_linked",
        userId: user.id,
        email: profile.email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { provider: "google", source: "signin" }
      },
      now
    );
    await emitAuthEvent(
      this.ctx,
      {
        type: "google_signin",
        userId: user.id,
        email: profile.email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { outcome: "linked" }
      },
      now
    );
    return { token, expiresAt, user: await loadAuthUser(this.ctx, user) };
  }
}
