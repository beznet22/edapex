import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { randomToken, sha256Hex } from "../crypto/digest";
import { AuthError } from "../errors";
import { emitAuthEvent } from "./auth-events";
import { consumeLimits } from "./rate-limit-policy";
import type { RateLimitAttempt, RateLimitRule } from "./rate-limit-policy";
import { issueSession, loadAuthUser } from "./session-issuance";
import type { AuthSessionResult } from "./types";

export const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export const MAGIC_LINK_LIMITS = {
  ipMinute: { limit: 5, windowSeconds: 60 },
  ipHour: { limit: 20, windowSeconds: 3600 },
  emailMinute: { limit: 5, windowSeconds: 60 },
  emailHour: { limit: 20, windowSeconds: 3600 }
} as const satisfies Record<string, RateLimitRule>;

const rateLimits = (
  email: string,
  ip: string | null
): readonly RateLimitAttempt[] => {
  const address = ip ?? "unknown";
  return [
    { key: `magic:ip:${address}:minute`, rule: MAGIC_LINK_LIMITS.ipMinute },
    { key: `magic:ip:${address}:hour`, rule: MAGIC_LINK_LIMITS.ipHour },
    { key: `magic:email:${email}:minute`, rule: MAGIC_LINK_LIMITS.emailMinute },
    { key: `magic:email:${email}:hour`, rule: MAGIC_LINK_LIMITS.emailHour }
  ];
};

export interface MagicLinkRequestInput {
  readonly email: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly origin: string;
}

export interface MagicLinkVerifyInput {
  readonly token: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly fingerprint: string | null;
}

/**
 * `04 §3.1`: request is always 202 and never discloses whether the address is
 * provisioned. Only a single active account receives a link.
 */
export class MagicLinkService {
  constructor(private readonly ctx: ServiceContext) {}

  async request(input: MagicLinkRequestInput): Promise<void> {
    const email = input.email.trim().toLowerCase();
    const now = this.ctx.ports.clock.now();
    await consumeLimits(this.ctx, rateLimits(email, input.ip), now);

    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const matches = await this.ctx.repos.accounts.listUsersByEmail(unscoped, email);
    const user = matches.length === 1 ? matches[0] : undefined;

    if (
      user === undefined ||
      user.activeStatus !== 1 ||
      user.claimStatus === "flagged" ||
      user.email === null
    ) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "magic_link_requested",
          email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: matches.length > 1 ? "ambiguous" : "unknown_or_inactive" }
        },
        now
      );
      return;
    }

    const token = randomToken();
    const expiresAt = now + MAGIC_LINK_TTL_SECONDS;
    await this.ctx.repos.accounts.createMagicLink(unscoped, {
      id: crypto.randomUUID(),
      userId: user.id,
      email,
      tokenHash: await sha256Hex(token),
      purpose: "signin",
      expiresAt,
      requestedIp: input.ip,
      createdAt: now
    });

    const url = new URL("/api/v1/auth/magic-link/verify", input.origin);
    url.searchParams.set("token", token);

    try {
      await this.ctx.ports.email.send({
        template: "magic_link",
        to: email,
        data: { url: url.toString(), expiresMinutes: MAGIC_LINK_TTL_SECONDS / 60 }
      });
    } catch (error) {
      this.ctx.logger.error("magic_link_email_failed", {
        message: error instanceof Error ? error.message : "unknown"
      });
    }

    await emitAuthEvent(
      this.ctx,
      {
        type: "magic_link_requested",
        userId: user.id,
        email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { outcome: "issued" }
      },
      now
    );
  }

  async verify(input: MagicLinkVerifyInput): Promise<AuthSessionResult> {
    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const now = this.ctx.ports.clock.now();
    const tokenHash = await sha256Hex(input.token);
    const link = await this.ctx.repos.accounts.consumeMagicLink(unscoped, tokenHash, now);

    if (link === null) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "magic_link_failed",
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "invalid_or_expired" }
        },
        now
      );
      throw new AuthError("This sign-in link is invalid or expired");
    }

    if (link.userId === null) {
      throw new AuthError("This sign-in link is invalid or expired");
    }

    const user = await this.ctx.repos.accounts.findUserById(unscoped, link.userId);
    if (
      user === null ||
      user.activeStatus !== 1 ||
      user.claimStatus === "flagged" ||
      user.email === null
    ) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "magic_link_failed",
          userId: link.userId,
          email: link.email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { outcome: "inactive_or_flagged" }
        },
        now
      );
      throw new AuthError("This sign-in link is invalid or expired");
    }

    await this.ctx.repos.accounts.markEmailVerified(unscoped, user.id, now);
    const session = await issueSession(this.ctx, user.id, {
      ip: input.ip,
      userAgent: input.userAgent,
      fingerprint: input.fingerprint
    });
    await emitAuthEvent(
      this.ctx,
      {
        type: "magic_link_verified",
        userId: user.id,
        email: user.email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { outcome: "signed_in" }
      },
      now
    );

    return { ...session, user: await loadAuthUser(this.ctx, user) };
  }
}
