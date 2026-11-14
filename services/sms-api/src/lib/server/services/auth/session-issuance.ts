import { requireUnscopedContext } from "../context";
import type { ServiceContext } from "../context";
import { randomToken, sha256Hex } from "../crypto/digest";
import { emitAuthEvent } from "./auth-events";
import { SESSION_TTL_SECONDS, toAuthUser } from "./types";
import type { AuthUser, UserLike } from "./types";

export interface SessionRequest {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly fingerprint: string | null;
}

export interface IssuedSession {
  readonly sessionId: string;
  readonly token: string;
  readonly expiresAt: number;
}

export async function issueSession(
  ctx: ServiceContext,
  userId: number,
  request: SessionRequest
): Promise<IssuedSession> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  const now = ctx.ports.clock.now();
  const sessionId = crypto.randomUUID();
  const token = randomToken();
  const expiresAt = now + SESSION_TTL_SECONDS;

  await ctx.repos.accounts.createSession(unscoped, {
    id: sessionId,
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt,
    deviceFingerprint: request.fingerprint,
    createdAt: now
  });
  await emitAuthEvent(
    ctx,
    {
      type: "session_issued",
      userId,
      ip: request.ip,
      userAgent: request.userAgent,
      metadata: { sessionId }
    },
    now
  );

  return { sessionId, token, expiresAt };
}

export async function loadAuthUser(ctx: ServiceContext, user: UserLike): Promise<AuthUser> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  const staff = await ctx.repos.accounts.findStaffByUserId(unscoped, user.id);
  return toAuthUser(user, staff);
}

export async function revokeAllSessions(
  ctx: ServiceContext,
  userId: number
): Promise<void> {
  const unscoped = requireUnscopedContext(ctx.repos.ctx);
  await ctx.repos.accounts.deleteAllUserSessions(unscoped, userId);
}
