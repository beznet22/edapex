import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { randomToken, sha256Hex } from "../crypto/digest";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { emitAuthEvent } from "./auth-events";

export type ClaimLinkPersona = "staff" | "parent";

export interface CreateClaimLinkInput {
  readonly subjectType: ClaimLinkPersona;
  readonly subjectId: number;
  readonly ttlHours: number;
  readonly adminUserId: number;
}

export interface CreatedClaimLink {
  readonly id: string;
  readonly url: string;
  readonly expiresAt: number;
}

/**
 * Single implementation of admin-issued claim-link creation. Kept outside the
 * service class so other services can compose it without service-to-service
 * imports.
 */
export async function createClaimLink(
  ctx: ServiceContext,
  input: CreateClaimLinkInput
): Promise<CreatedClaimLink> {
  const config = ctx.ports.authConfig;
  if (!config.claimLinkEnabled) throw new ConflictError("Claim links are not enabled");
  if (input.ttlHours < 1 || input.ttlHours > 168) {
    throw new ValidationError("ttlHours must be between 1 and 168", "ttlHours");
  }

  const scoped = requireScopedContext(ctx.repos.ctx);
  const subject =
    input.subjectType === "parent"
      ? await ctx.repos.queries.findParentClaimSubject(scoped, input.subjectId)
      : await ctx.repos.queries.findStaffClaimSubject(scoped, input.subjectId);
  if (subject === null) {
    throw new NotFoundError(input.subjectType, input.subjectId);
  }
  if (subject.userId !== null) {
    const account = await ctx.repos.queries.findAccountInTenant(scoped, subject.userId);
    if (account === null) throw new NotFoundError("user", subject.userId);
    if (account.claimStatus === "flagged") {
      throw new ConflictError("This account is flagged for administrative review");
    }
    if (account.claimStatus === "claimed") {
      throw new ConflictError("This account is already claimed");
    }
  }
  const email = subject.email?.trim().toLowerCase() ?? "";
  if (email.length === 0) {
    throw new ValidationError("The record has no email address", "subjectId");
  }

  const now = ctx.ports.clock.now();
  const userId =
    subject.userId ?? (await ctx.repos.accounts.provisionSubjectUser(scoped, subject));
  const token = randomToken();
  const id = crypto.randomUUID();
  const expiresAt = now + input.ttlHours * 3600;
  await ctx.repos.accounts.createMagicLink(scoped, {
    id,
    userId,
    email,
    subjectType: input.subjectType,
    subjectId: input.subjectId,
    schoolId: scoped.tenant.schoolId,
    createdBy: input.adminUserId,
    tokenHash: await sha256Hex(token),
    purpose: "claim_link",
    expiresAt,
    requestedIp: null,
    createdAt: now
  });
  await emitAuthEvent(
    ctx,
    {
      type: "claim_link_issued",
      userId,
      email,
      metadata: {
        claimLinkId: id,
        adminUserId: input.adminUserId,
        ttlHours: input.ttlHours,
        subjectType: input.subjectType,
        subjectId: input.subjectId
      }
    },
    now
  );

  return {
    id,
    url: `${config.appOrigin}/claim#token=${token}`,
    expiresAt
  };
}
