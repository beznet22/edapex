import type { ServiceContext } from "../context";
import { consumeLimit } from "./rate-limit-policy";
import type { RateLimitRule } from "./rate-limit-policy";

export const CLAIM_TICKET_TTL_SECONDS = 10 * 60;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const CODE_PREFIX_LENGTH = 4;

/** `03 §...` sets 5/min; `04a §3` adds the hourly bound for the claim window. */
export const CLAIM_LIMITS = {
  ipMinute: { limit: 5, windowSeconds: 60 },
  ipHour: { limit: 20, windowSeconds: 3600 },
  emailMinute: { limit: 5, windowSeconds: 60 },
  emailHour: { limit: 20, windowSeconds: 3600 }
} as const satisfies Record<string, RateLimitRule>;

export const CODE_LIMITS = {
  ipMinute: { limit: 10, windowSeconds: 60 },
  prefixMinute: { limit: 10, windowSeconds: 60 }
} as const satisfies Record<string, RateLimitRule>;

export interface RateLimitAttempt {
  readonly key: string;
  readonly rule: RateLimitRule;
}

const identity = (value: string | null): string => value ?? "unknown";

export const claimRateLimits = (
  email: string,
  ip: string | null
): readonly RateLimitAttempt[] => {
  const address = identity(ip);
  return [
    { key: `claim:ip:${address}:minute`, rule: CLAIM_LIMITS.ipMinute },
    { key: `claim:ip:${address}:hour`, rule: CLAIM_LIMITS.ipHour },
    { key: `claim:email:${email}:minute`, rule: CLAIM_LIMITS.emailMinute },
    { key: `claim:email:${email}:hour`, rule: CLAIM_LIMITS.emailHour }
  ];
};

export const codeRateLimits = (
  prefix: string,
  ip: string | null
): readonly RateLimitAttempt[] => {
  const address = identity(ip);
  return [
    { key: `code:ip:${address}:minute`, rule: CODE_LIMITS.ipMinute },
    { key: `code:prefix:${prefix}:minute`, rule: CODE_LIMITS.prefixMinute }
  ];
};

export async function consumeClaimAttempt(
  ctx: ServiceContext,
  email: string,
  ip: string | null,
  now: number
): Promise<void> {
  for (const attempt of claimRateLimits(email, ip)) {
    await consumeLimit(ctx, attempt.key, attempt.rule, now);
  }
}

export async function consumeCodeAttempt(
  ctx: ServiceContext,
  prefix: string,
  ip: string | null,
  now: number
): Promise<void> {
  for (const attempt of codeRateLimits(prefix, ip)) {
    await consumeLimit(ctx, attempt.key, attempt.rule, now);
  }
}

export const codePrefixOf = (normalised: string): string =>
  normalised.slice(0, CODE_PREFIX_LENGTH);

export interface ClaimTicketPayload extends Record<string, unknown> {
  readonly purpose: "claim";
  readonly userId: number;
  readonly exp: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const isClaimTicketPayload = (value: unknown): value is ClaimTicketPayload =>
  isRecord(value) &&
  value["purpose"] === "claim" &&
  typeof value["userId"] === "number" &&
  typeof value["exp"] === "number";
