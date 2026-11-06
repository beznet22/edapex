import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";

import { authCodes } from "../../db/schema";
import { batchOrThrow, chunkedInArray, chunkedInsert } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { RepositoryContext, ScopedRepositoryContext } from "../base/repository-context";
import type { AuthCodeRow, NewAuthCode } from "./types";

const AUTH_CODE_COLUMNS = 9;

/** Codes are readable only through their SHA-256 hash (`04 §2.2`). */
export async function insertAuthCode(
  ctx: RepositoryContext,
  code: NewAuthCode
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.insert(authCodes).values(code);
    },
    "insertAuthCode"
  );
}

export async function insertAuthCodes(
  ctx: RepositoryContext,
  codes: readonly NewAuthCode[]
): Promise<void> {
  if (codes.length === 0) return;
  await withErrorHandling(
    async () => {
      const statements = chunkedInsert(ctx.db, authCodes, [...codes], AUTH_CODE_COLUMNS);
      await batchOrThrow(ctx.db, statements);
    },
    "insertAuthCodes"
  );
}

export async function findAuthCodeByHash(
  ctx: RepositoryContext,
  codeHash: string,
  now: number
): Promise<AuthCodeRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(authCodes)
      .where(
        and(
          eq(authCodes.codeHash, codeHash),
          isNull(authCodes.revokedAt),
          or(isNull(authCodes.expiresAt), gt(authCodes.expiresAt, now))
        )
      )
      .limit(1);
    return row ?? null;
  }, "findAuthCodeByHash");
}

export async function touchAuthCodeUsed(
  ctx: RepositoryContext,
  codeId: string,
  now: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db.update(authCodes).set({ lastUsedAt: now }).where(eq(authCodes.id, codeId));
    },
    "touchAuthCodeUsed"
  );
}

/**
 * Revokes in chunks of 95 ids. Bulk issuance deliberately stops here rather
 * than spanning batches: each student's code is independent, so a partial
 * chunk is recoverable by re-running the issue (it re-revokes first).
 */
export async function revokeActiveCodes(
  ctx: ScopedRepositoryContext,
  subjectIds: readonly number[],
  revokedAt: number
): Promise<void> {
  const predicates = chunkedInArray(authCodes.subjectId, subjectIds);
  if (predicates.length === 0) return;
  await withErrorHandling(
    async () => {
      const statements: BatchItem<"sqlite">[] = predicates.map((predicate) =>
        ctx.db
          .update(authCodes)
          .set({ revokedAt })
          .where(
            and(
              eq(authCodes.subjectType, "student"),
              isNull(authCodes.revokedAt),
              predicate
            )
          )
      );
      await batchOrThrow(ctx.db, statements);
    },
    "revokeActiveCodes"
  );
}

export async function revokeCodeById(
  ctx: RepositoryContext,
  codeId: string,
  revokedAt: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .update(authCodes)
        .set({ revokedAt })
        .where(and(eq(authCodes.id, codeId), isNull(authCodes.revokedAt)));
    },
    "revokeCodeById"
  );
}
