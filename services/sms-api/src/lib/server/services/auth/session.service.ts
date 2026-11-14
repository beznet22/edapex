import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { AuthError, ConflictError, ValidationError } from "../errors";
import { randomToken, sha256Hex } from "../crypto/digest";
import { issueSession, loadAuthUser } from "./session-issuance";
import type { SessionRequest } from "./session-issuance";
import {
  SESSION_TTL_SECONDS,
  toAuthUser,
  type AuthSessionResult,
  type SessionView
} from "./types";

export interface RefreshResult {
  readonly token: string;
  readonly expiresAt: number;
}

export class SessionService {
  constructor(private readonly ctx: ServiceContext) {}

  async getSession(token: string, fingerprint: string | null = null): Promise<SessionView | null> {
    if (token.trim().length === 0) return null;
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const pair = await this.ctx.repos.accounts.validateSession(
      unscoped,
      await sha256Hex(token),
      fingerprint,
      this.ctx.ports.clock.now()
    );
    if (pair === null) return null;
    const staff = await this.ctx.repos.accounts.findStaffByUserId(unscoped, pair.user.id);
    return {
      sessionId: pair.session.id,
      expiresAt: pair.session.expiresAt,
      user: toAuthUser(pair.user, staff)
    };
  }

  async issueForUser(
    userId: number,
    request: SessionRequest
  ): Promise<AuthSessionResult> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const user = await this.ctx.repos.accounts.findUserById(unscoped, userId);
    if (user === null) throw new AuthError("This account does not exist");
    if (user.activeStatus !== 1) throw new AuthError("This account is not active");
    if (user.claimStatus === "flagged") {
      throw new ConflictError(
        "This account is under administrative review; contact the school administrator"
      );
    }
    const session = await issueSession(this.ctx, user.id, request);
    return { ...session, user: await loadAuthUser(this.ctx, user) };
  }

  async refresh(token: string, fingerprint: string | null = null): Promise<RefreshResult> {
    if (token.trim().length === 0) {
      throw new AuthError("A session token is required");
    }
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const oldHash = await sha256Hex(token);
    const now = this.ctx.ports.clock.now();
    const pair = await this.ctx.repos.accounts.validateSession(
      unscoped,
      oldHash,
      fingerprint,
      now
    );
    if (pair === null) {
      throw new AuthError("The session is expired or revoked");
    }

    const nextToken = randomToken();
    const expiresAt = now + SESSION_TTL_SECONDS;
    await this.ctx.repos.accounts.rotateSession(unscoped, oldHash, {
      id: crypto.randomUUID(),
      userId: pair.user.id,
      tokenHash: await sha256Hex(nextToken),
      expiresAt,
      deviceFingerprint: fingerprint ?? pair.session.deviceFingerprint,
      createdAt: now
    });
    return { token: nextToken, expiresAt };
  }

  async logout(token: string): Promise<void> {
    if (token.trim().length === 0) return;
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.accounts.revokeSessionByTokenHash(
      unscoped,
      await sha256Hex(token),
      this.ctx.ports.clock.now()
    );
  }

  async logoutAll(userId: number): Promise<void> {
    if (userId <= 0) {
      throw new ValidationError("A positive user id is required", "userId");
    }
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.accounts.deleteAllUserSessions(unscoped, userId);
  }

  async logoutMobile(token: string): Promise<void> {
    return this.logout(token);
  }

  async refreshMobile(token: string): Promise<RefreshResult> {
    return this.refresh(token);
  }
}
