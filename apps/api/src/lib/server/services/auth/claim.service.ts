import type { ServiceContext } from "../context";
import { requireUnscopedContext } from "../context";
import { constantTimeEqual, sha256Hex } from "../crypto/digest";
import { AmbiguousEmailError, AuthError, ConflictError } from "../errors";
import { emitAuthEvent } from "./auth-events";
import { completeClaim } from "./claim-link";
import {
  CLAIM_TICKET_TTL_SECONDS,
  consumeClaimAttempt
} from "./claim-policy";
import { signPayload } from "./signed-payload";
import type { AuthSessionResult } from "./types";
import type { ClaimLinkInput } from "./claim-link";

export interface ClaimRequestInput {
  readonly email: string;
  readonly password: string;
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface ClaimRequestResult {
  readonly ticket: string | null;
}

/**
 * `04a §3`: unknown email and a correct shared digest both answer 202 with the
 * same body; only the Set-Cookie differs (HttpOnly, unreadable to scripts).
 * Every outcome is distinguishable in `auth_events`, never in the response.
 */
export class ClaimService {
  constructor(private readonly ctx: ServiceContext) {}

  async request(input: ClaimRequestInput): Promise<ClaimRequestResult> {
    const config = this.ctx.ports.authConfig;
    if (!config.claimEnabled || config.claimDigest === null || config.cookieSecret === null) {
      throw new ConflictError("The claim flow is not available");
    }

    const now = this.ctx.ports.clock.now();
    const email = input.email.trim().toLowerCase();
    await consumeClaimAttempt(this.ctx, email, input.ip, now);

    const submitted = await sha256Hex(input.password);
    const digestMatches = constantTimeEqual(submitted, config.claimDigest);

    const unscoped = requireUnscopedContext(this.ctx.repos.ctx);
    const matches = await this.ctx.repos.accounts.listUsersByEmail(unscoped, email);
    await emitAuthEvent(
      this.ctx,
      {
        type: "claim_attempt",
        email,
        ip: input.ip,
        userAgent: input.userAgent,
        metadata: { matches: matches.length }
      },
      now
    );

    if (matches.length === 0) return { ticket: null };
    if (matches.length > 1) {
      await emitAuthEvent(
        this.ctx,
        { type: "claim_ambiguous", email, ip: input.ip, userAgent: input.userAgent },
        now
      );
      throw new AmbiguousEmailError(email);
    }

    const user = matches[0];
    if (user === undefined) return { ticket: null };

    if (user.claimStatus === "flagged") {
      await emitAuthEvent(
        this.ctx,
        { type: "claim_flagged", userId: user.id, email, ip: input.ip, userAgent: input.userAgent },
        now
      );
      throw new ConflictError(
        "This account is under administrative review; contact the school administrator"
      );
    }

    if (user.claimStatus === "claimed" || user.password === null) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "claim_failure",
          userId: user.id,
          email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { reason: "already_claimed" }
        },
        now
      );
      throw new AuthError("Invalid credentials");
    }

    if (!digestMatches) {
      await emitAuthEvent(
        this.ctx,
        {
          type: "claim_failure",
          userId: user.id,
          email,
          ip: input.ip,
          userAgent: input.userAgent,
          metadata: { reason: "digest_mismatch" }
        },
        now
      );
      throw new AuthError("Invalid credentials");
    }

    const ticket = await signPayload(
      config.cookieSecret,
      { purpose: "claim", userId: user.id },
      now + CLAIM_TICKET_TTL_SECONDS
    );
    await emitAuthEvent(
      this.ctx,
      {
        type: "claim_ticket_issued",
        userId: user.id,
        email,
        ip: input.ip,
        userAgent: input.userAgent
      },
      now
    );
    return { ticket };
  }

  async complete(input: ClaimLinkInput): Promise<AuthSessionResult> {
    return completeClaim(this.ctx, input);
  }
}
