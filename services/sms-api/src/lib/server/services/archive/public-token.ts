import { z } from "zod";

import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { PortError } from "../errors";
import { signPayload, verifyPayload } from "../crypto/signed-payload";
import { sha256BytesHex } from "./archive-object";

export const PUBLIC_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;

const scopeSchema = z.object({
  studentId: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  examTypeId: z.number().int().nonnegative(),
  version: z.number().int().positive(),
  jti: z.string().min(1),
  exp: z.number().int()
});
export type PublicTokenScope = z.infer<typeof scopeSchema>;

const isScope = (value: unknown): value is PublicTokenScope =>
  scopeSchema.safeParse(value).success;

export interface IssuedPublicToken {
  readonly token: string;
  readonly tokenId: number;
  readonly expiresAt: number;
}

export interface VerifiedPublicToken {
  readonly tokenId: number;
  readonly schoolId: number;
  readonly studentId: number;
  readonly sessionId: number;
  readonly examTypeId: number;
  readonly version: number;
  readonly expiresAt: number;
}

export interface IssuePublicTokenInput {
  readonly studentId: number;
  readonly sessionId: number;
  readonly examTypeId: number;
  readonly version: number;
}

export async function issuePublicToken(
  ctx: ServiceContext,
  input: IssuePublicTokenInput,
  actorId: number
): Promise<IssuedPublicToken> {
  const secret = ctx.tokenSecret;
  if (secret === null) {
    throw new PortError("archive", "ARCHIVE_TOKEN_SECRET is not configured", false);
  }
  const scoped = requireScopedContext(ctx.repos.ctx);
  const now = ctx.ports.clock.now();
  const expiresAt = now + PUBLIC_TOKEN_TTL_SECONDS;
  const jti = crypto.randomUUID();
  const token = await signPayload(
    secret,
    {
      studentId: input.studentId,
      sessionId: input.sessionId,
      examTypeId: input.examTypeId,
      version: input.version,
      jti
    },
    expiresAt
  );
  const tokenHash = await sha256BytesHex(new TextEncoder().encode(token));
  await ctx.repos.archive.insertPublicToken(scoped, {
    schoolId: scoped.tenant.schoolId,
    studentId: input.studentId,
    academicId: input.sessionId,
    examTypeId: input.examTypeId,
    version: input.version,
    jti,
    tokenHash,
    issuedBy: actorId,
    issuedAt: now,
    expiresAt
  });
  const row = await ctx.repos.archive.findPublicTokenByJtiUnscoped(ctx.repos.ctx, jti);
  return { token, tokenId: row?.id ?? 0, expiresAt };
}

export async function verifyPublicToken(
  ctx: ServiceContext,
  token: string,
  now: number
): Promise<VerifiedPublicToken | null> {
  const secret = ctx.tokenSecret;
  if (secret === null) return null;
  const scope = await verifyPayload(secret, token, isScope, now);
  if (scope === null) return null;
  const row = await ctx.repos.archive.findPublicTokenByJtiUnscoped(ctx.repos.ctx, scope.jti);
  if (row === null || row.revokedAt !== null || row.expiresAt < now) return null;
  const scopeMatches =
    row.studentId === scope.studentId &&
    row.academicId === scope.sessionId &&
    row.examTypeId === scope.examTypeId &&
    row.version === scope.version;
  if (!scopeMatches) return null;
  const tokenHash = await sha256BytesHex(new TextEncoder().encode(token));
  if (tokenHash !== row.tokenHash) return null;
  return {
    tokenId: row.id,
    schoolId: row.schoolId,
    studentId: row.studentId,
    sessionId: row.academicId,
    examTypeId: row.examTypeId,
    version: row.version,
    expiresAt: row.expiresAt
  };
}
