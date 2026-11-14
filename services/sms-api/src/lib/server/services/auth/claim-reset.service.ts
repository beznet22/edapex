import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, ValidationError } from "../errors";
import { emitAuthEvent } from "./auth-events";

export interface ClaimResetInput {
  readonly actorUserId: number;
}

export interface ClaimResetResult {
  readonly schoolId: number;
  readonly actorUserId: number;
  readonly count: number;
  readonly pending: number;
}

/**
 * `04a §2`: one app-wide digest written to every claimable account in this
 * school. Idempotent by construction and recorded in a single bulk event.
 */
export class ClaimResetService {
  constructor(private readonly ctx: ServiceContext) {}

  async reset(input: ClaimResetInput): Promise<ClaimResetResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const config = this.ctx.ports.authConfig;
    if (!config.claimEnabled || config.claimDigest === null) {
      throw new ConflictError("The claim flow is not available");
    }
    if (!Number.isInteger(input.actorUserId) || input.actorUserId <= 0) {
      throw new ValidationError("A positive actor user id is required", "actorUserId");
    }

    const now = this.ctx.ports.clock.now();
    const count = await this.ctx.repos.accounts.resetClaimDigests(scoped, config.claimDigest);
    const states = await this.ctx.repos.accounts.countClaimStates(scoped);

    await emitAuthEvent(
      this.ctx,
      {
        type: "password_reset_bulk",
        userId: input.actorUserId,
        metadata: {
          actorUserId: input.actorUserId,
          schoolId: scoped.tenant.schoolId,
          count
        }
      },
      now
    );

    return {
      schoolId: scoped.tenant.schoolId,
      actorUserId: input.actorUserId,
      count,
      pending: states.pending
    };
  }
}
