import { and, count, eq, gt, isNull, max, or } from "drizzle-orm";

import {
  authEvents,
  authIdentities,
  authSessions,
  smParents,
  smStaffs,
  smStudents,
  users
} from "../../db/schema";
import { chunkedInArray } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type PersonaKind = "student" | "staff" | "parent";

export interface PersonaLink {
  readonly userId: number;
  readonly persona: PersonaKind;
}

export interface SessionCount {
  readonly userId: number;
  readonly total: number;
}

export interface IdentityProviderRow {
  readonly userId: number;
  readonly provider: string;
}

export interface LastLoginRow {
  readonly userId: number;
  readonly lastLoginAt: number | null;
}

/**
 * Personas come from the persona tables, never `users.usertype` (`04a §5.1`).
 * `auth_*` tables have no school column, so the caller passes user ids that
 * were already resolved inside the tenant.
 */
export async function listPersonaLinks(
  ctx: ScopedRepositoryContext,
  userIds: readonly number[]
): Promise<readonly PersonaLink[]> {
  const studentPredicates = chunkedInArray(smStudents.userId, userIds);
  if (studentPredicates.length === 0) return [];

  return withErrorHandling(async () => {
    const students = await ctx.db
      .select({ userId: smStudents.userId })
      .from(smStudents)
      .where(and(eq(smStudents.schoolId, ctx.tenant.schoolId), or(...studentPredicates)));
    const staffs = await ctx.db
      .select({ userId: smStaffs.userId })
      .from(smStaffs)
      .where(
        and(
          eq(smStaffs.schoolId, ctx.tenant.schoolId),
          or(...chunkedInArray(smStaffs.userId, userIds))
        )
      );
    const parents = await ctx.db
      .select({ userId: smParents.userId })
      .from(smParents)
      .where(
        and(
          eq(smParents.schoolId, ctx.tenant.schoolId),
          or(...chunkedInArray(smParents.userId, userIds))
        )
      );

    const links: PersonaLink[] = [];
    for (const row of students) {
      if (row.userId !== null) links.push({ userId: row.userId, persona: "student" });
    }
    for (const row of staffs) {
      if (row.userId !== null) links.push({ userId: row.userId, persona: "staff" });
    }
    for (const row of parents) {
      if (row.userId !== null) links.push({ userId: row.userId, persona: "parent" });
    }
    return links;
  }, "listPersonaLinks");
}

export async function listSessionCounts(
  ctx: ScopedRepositoryContext,
  userIds: readonly number[],
  now: number
): Promise<readonly SessionCount[]> {
  const predicates = chunkedInArray(authSessions.userId, userIds);
  if (predicates.length === 0) return [];
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ userId: authSessions.userId, total: count() })
        .from(authSessions)
        .where(
          and(
            or(...predicates),
            isNull(authSessions.revokedAt),
            gt(authSessions.expiresAt, now)
          )
        )
        .groupBy(authSessions.userId),
    "listSessionCounts"
  );
}

export async function listIdentityProviders(
  ctx: ScopedRepositoryContext,
  userIds: readonly number[]
): Promise<readonly IdentityProviderRow[]> {
  const predicates = chunkedInArray(authIdentities.userId, userIds);
  if (predicates.length === 0) return [];
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ userId: authIdentities.userId, provider: authIdentities.provider })
        .from(authIdentities)
        .where(or(...predicates))
        .orderBy(authIdentities.userId, authIdentities.provider),
    "listIdentityProviders"
  );
}

export async function listSchoolIdentityProviders(
  ctx: ScopedRepositoryContext
): Promise<readonly IdentityProviderRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ userId: authIdentities.userId, provider: authIdentities.provider })
        .from(authIdentities)
        .innerJoin(users, eq(authIdentities.userId, users.id))
        .where(eq(users.schoolId, ctx.tenant.schoolId))
        .orderBy(authIdentities.userId, authIdentities.provider),
    "listSchoolIdentityProviders"
  );
}

export async function listLastLogins(
  ctx: ScopedRepositoryContext,
  userIds: readonly number[]
): Promise<readonly LastLoginRow[]> {
  const predicates = chunkedInArray(authEvents.userId, userIds);
  if (predicates.length === 0) return [];
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .select({ userId: authEvents.userId, lastLoginAt: max(authEvents.createdAt) })
      .from(authEvents)
      .where(or(...predicates))
      .groupBy(authEvents.userId);
    return rows.flatMap((row) =>
      row.userId === null ? [] : [{ userId: row.userId, lastLoginAt: row.lastLoginAt }]
    );
  }, "listLastLogins");
}
