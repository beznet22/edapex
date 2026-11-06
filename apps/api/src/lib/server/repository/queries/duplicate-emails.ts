import { and, count, eq, gt, isNotNull, or } from "drizzle-orm";

import { users } from "../../db/schema";
import { chunkedInArray } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
export interface DuplicateEmailGroup {
  readonly email: string | null;
  readonly accountCount: number;
}

export interface DuplicateAccountRow {
  readonly userId: number;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly activeStatus: number | null;
  readonly claimStatus: "pending" | "claimed" | "flagged" | null;
  readonly isAdministrator: string;
}

/** Duplicate detection is per school; the same address in another school is unrelated. */
export async function listDuplicateEmailGroups(
  ctx: ScopedRepositoryContext
): Promise<readonly DuplicateEmailGroup[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ email: users.email, accountCount: count() })
        .from(users)
        .where(and(eq(users.schoolId, ctx.tenant.schoolId), isNotNull(users.email)))
        .groupBy(users.email)
        .having(gt(count(), 1)),
    "listDuplicateEmailGroups"
  );
}

export async function findAccountInTenant(
  ctx: ScopedRepositoryContext,
  userId: number
): Promise<DuplicateAccountRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        userId: users.id,
        fullName: users.fullName,
        email: users.email,
        activeStatus: users.activeStatus,
        claimStatus: users.claimStatus,
        isAdministrator: users.isAdministrator
      })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return row ?? null;
  }, "findAccountInTenant");
}

export async function listAccountsForEmails(
  ctx: ScopedRepositoryContext,
  emails: readonly string[]
): Promise<readonly DuplicateAccountRow[]> {
  const predicates = chunkedInArray(users.email, emails);
  if (predicates.length === 0) return [];
  return withErrorHandling(
    async () =>
      ctx.db
        .select({
          userId: users.id,
          fullName: users.fullName,
          email: users.email,
          activeStatus: users.activeStatus,
          claimStatus: users.claimStatus,
          isAdministrator: users.isAdministrator
        })
        .from(users)
        .where(and(eq(users.schoolId, ctx.tenant.schoolId), or(...predicates)))
        .orderBy(users.id),
    "listAccountsForEmails"
  );
}
