import { requireUnscopedContext } from "../context";
import type { ServiceContext } from "../context";
import { randomToken, sha256Hex } from "../crypto/digest";
import { AuthError, ConflictError, LinkEmailMismatchError, LinkEmailUnverifiedError } from "../errors";
import type { GoogleProfile } from "../ports/google-oauth.port";
import { emitAuthEvent } from "./auth-events";
import { loadAuthUser } from "./session-issuance";
import { SESSION_TTL_SECONDS } from "./types";
import type { AuthSessionResult } from "./types";

export interface ClaimLinkInput {
  readonly userId: number;
  readonly profile: GoogleProfile;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly fingerprint: string | null;
}

const normalized = (value: string): string => value.trim().toLowerCase();

/**
 * The linking rules from `04 §5` and the Phase 5 decision: the Google address
 * must be verified and equal `users.email`; ambiguity is a hard stop; one
 * Google identity per account. A retry with the same identity replaces only
 * the session.
 */
export async function completeClaim(
  ctx: ServiceContext,
  input: ClaimLinkInput
): Promise<AuthSessionResult> {
  const config = ctx.ports.authConfig;
  if (!config.claimEnabled) {
    throw new ConflictError("The claim flow is not available");
  }
  const now = ctx.ports.clock.now();
  const unscoped = requireUnscopedContext(ctx.repos.ctx);

  if (!input.profile.emailVerified) {
    await emitAuthEvent(
      ctx,
      {
        type: "claim_failure",
        userId: input.userId,
        email: input.profile.email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { reason: "email_unverified" }
      },
      now
    );
    throw new LinkEmailUnverifiedError();
  }

  const user = await ctx.repos.accounts.findUserById(unscoped, input.userId);
  if (user === null) throw new AuthError("Invalid credentials");

  if (user.claimStatus === "flagged") {
    await emitAuthEvent(
      ctx,
      { type: "claim_flagged", userId: user.id, email: user.email, ip: input.ip, userAgent: input.userAgent },
      now
    );
    throw new ConflictError(
      "This account is under administrative review; contact the school administrator"
    );
  }

  const accountEmail = user.email === null ? null : normalized(user.email);
  if (accountEmail === null || accountEmail !== normalized(input.profile.email)) {
    await emitAuthEvent(
      ctx,
      {
        type: "claim_failure",
        userId: user.id,
        email: accountEmail,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { reason: "email_mismatch" }
      },
      now
    );
    throw new LinkEmailMismatchError();
  }

  const identity = await ctx.repos.accounts.findIdentity(
    unscoped,
    "google",
    input.profile.providerUserId
  );
  if (identity !== null && identity.userId !== user.id) {
    await emitAuthEvent(
      ctx,
      {
        type: "claim_failure",
        userId: user.id,
        email: accountEmail,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { reason: "identity_bound_elsewhere" }
      },
      now
    );
    throw new ConflictError("This Google account is already linked to another account");
  }

  const identities = await ctx.repos.accounts.findIdentitiesByUserId(unscoped, user.id);
  const otherGoogle = identities.find(
    (row) =>
      row.provider === "google" && row.providerUserId !== input.profile.providerUserId
  );
  if (otherGoogle !== undefined) {
    throw new ConflictError("This account already has a different Google identity");
  }

  const token = randomToken();
  const sessionId = crypto.randomUUID();
  const expiresAt = now + SESSION_TTL_SECONDS;
  const session = {
    id: sessionId,
    userId: user.id,
    tokenHash: await sha256Hex(token),
    expiresAt,
    deviceFingerprint: input.fingerprint,
    createdAt: now
  };

  if (identity === null) {
    await ctx.repos.accounts.completeClaimLink(unscoped, {
      userId: user.id,
      identity: {
        id: crypto.randomUUID(),
        userId: user.id,
        provider: "google",
        providerUserId: input.profile.providerUserId,
        emailAtProvider: normalized(input.profile.email),
        emailVerified: 1,
        createdAt: now,
        lastUsedAt: now
      },
      session,
      now
    });
    await emitAuthEvent(
      ctx,
      {
        type: "identity_linked",
        userId: user.id,
        email: accountEmail,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { provider: "google" }
      },
      now
    );
  } else {
    await ctx.repos.accounts.replaceUserSessions(unscoped, user.id, session);
  }

  await emitAuthEvent(
    ctx,
    {
      type: "claim_success",
      userId: user.id,
      email: accountEmail,
      ip: input.ip,
      userAgent: input.userAgent,
      metadata: { sessionId, alreadyLinked: identity !== null }
    },
    now
  );

  return { token, expiresAt, user: await loadAuthUser(ctx, user) };
}
