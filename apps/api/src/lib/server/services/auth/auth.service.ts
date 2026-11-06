import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { AmbiguousEmailError, AuthError } from "../errors";
import { constantTimeEqual, randomToken, sha256Hex } from "../crypto/digest";
import { assertNotLimited, recordFailure, resetLimit } from "./rate-limit-policy";
import { SESSION_TTL_SECONDS, toAuthUser, type AuthUser } from "./types";

export interface LoginInput {
  readonly identifier: string;
  readonly password: string;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly fingerprint?: string | null;
}

export interface LoginResult {
  readonly token: string;
  readonly expiresAt: number;
  readonly user: AuthUser;
}

export class AuthService {
  constructor(private readonly ctx: ServiceContext) {}

  private async recordEvent(
    type: string,
    userId: number | null,
    email: string | null,
    input: LoginInput,
    now: number
  ): Promise<void> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.accounts.createAuthEvent(unscoped, {
      id: crypto.randomUUID(),
      type,
      userId,
      email,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: now
    });
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const raw = input.identifier.trim();
    if (raw.length === 0 || input.password.length === 0) {
      throw new AuthError("Invalid credentials");
    }

    const identifier = raw.toLowerCase();
    const now = this.ctx.ports.clock.now();
    const keys = [`login:${identifier}`, `login-ip:${input.ip ?? "unknown"}`];
    for (const key of keys) {
      await assertNotLimited(this.ctx, key, now);
    }

    const reject = async (userId: number | null, email: string | null): Promise<never> => {
      for (const key of keys) {
        await recordFailure(this.ctx, key, now);
      }
      await this.recordEvent("login_failed", userId, email, input, now);
      throw new AuthError("Invalid credentials");
    };

    const emailMatches = identifier.includes("@")
      ? await this.ctx.repos.accounts.listUsersByEmail(unscoped, identifier)
      : [];
    if (emailMatches.length > 1) {
      await this.recordEvent("login_ambiguous", null, identifier, input, now);
      throw new AmbiguousEmailError(identifier);
    }

    const user = identifier.includes("@")
      ? (emailMatches.at(0) ?? null)
      : await this.ctx.repos.accounts.findUserByUsername(unscoped, raw);

    if (user === null || user.activeStatus !== 1 || user.password === null) {
      return reject(user?.id ?? null, user?.email ?? identifier);
    }

    const digest = await sha256Hex(input.password);
    if (!constantTimeEqual(digest, user.password)) {
      return reject(user.id, user.email);
    }

    const token = randomToken();
    const expiresAt = now + SESSION_TTL_SECONDS;
    await this.ctx.repos.accounts.createSession(unscoped, {
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await sha256Hex(token),
      expiresAt,
      deviceFingerprint: input.fingerprint ?? null,
      createdAt: now
    });

    for (const key of keys) {
      await resetLimit(this.ctx, key);
    }
    const staff = await this.ctx.repos.accounts.findStaffByUserId(unscoped, user.id);
    await this.recordEvent("login_succeeded", user.id, user.email, input, now);

    return { token, expiresAt, user: toAuthUser(user, staff) };
  }
}
