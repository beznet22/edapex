import type { ServiceContext } from "../context";

export const AUTH_EVENT_TYPES = [
  "claim_attempt",
  "claim_flagged",
  "claim_ambiguous",
  "claim_failure",
  "claim_success",
  "claim_ticket_issued",
  "identity_linked",
  "google_signin",
  "session_issued",
  "code_attempt",
  "code_success",
  "code_failure",
  "code_issued",
  "code_reissued",
  "code_revoked",
  "password_reset_bulk",
  "account_merge",
  "account_reassign",
  "account_flagged",
  "archive_wipe"
] as const;

export type AuthEventType = (typeof AUTH_EVENT_TYPES)[number];

export type AuthEventMetadata = Readonly<
  Record<string, string | number | boolean | null>
>;

export interface AuthEventInput {
  readonly type: AuthEventType;
  readonly userId?: number | null;
  readonly email?: string | null;
  readonly ip?: string | null;
  readonly userAgent?: string | null;
  readonly metadata?: AuthEventMetadata | null;
}

/** Every attempt, success, failure, link, merge and revoke writes one row (`04 §8`). */
export async function emitAuthEvent(
  ctx: ServiceContext,
  input: AuthEventInput,
  now: number
): Promise<void> {
  await ctx.repos.accounts.createAuthEvent(ctx.repos.ctx, {
    id: crypto.randomUUID(),
    type: input.type,
    userId: input.userId ?? null,
    email: input.email ?? null,
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    metadata: input.metadata === undefined || input.metadata === null
      ? null
      : JSON.stringify(input.metadata),
    createdAt: now
  });
}
