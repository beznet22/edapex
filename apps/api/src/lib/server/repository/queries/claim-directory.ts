import { and, eq, isNotNull, sql } from "drizzle-orm";

import { smParents, smStaffs, users } from "../../db/schema";
import { batchOrThrow } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type DirectoryPersona = "staff" | "parent";

export interface ClaimSubjectRow {
  readonly subjectType: "parent" | "staff";
  readonly subjectId: number;
  readonly userId: number | null;
  readonly fullName: string | null;
  readonly email: string | null;
}

export interface DirectoryPersonRow {
  readonly persona: DirectoryPersona;
  readonly recordId: number;
  readonly userId: number | null;
  readonly fullName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly claimStatus: "pending" | "claimed" | "flagged" | null;
  readonly password: string | null;
  readonly userActive: number | null;
  readonly emailVerifiedAt: number | null;
}

/** Staff and parent records, linked to the canonical user where one exists. */
export async function listClaimDirectory(
  ctx: ScopedRepositoryContext
): Promise<readonly DirectoryPersonRow[]> {
  return withErrorHandling(async () => {
    const staff = await ctx.db
      .select({
        recordId: smStaffs.id,
        userId: smStaffs.userId,
        fullName: smStaffs.fullName,
        email: users.email,
        fallbackEmail: smStaffs.email,
        phone: smStaffs.mobile,
        claimStatus: users.claimStatus,
        password: users.password,
        userActive: users.activeStatus,
        emailVerifiedAt: users.emailVerifiedAt
      })
      .from(smStaffs)
      .leftJoin(users, eq(smStaffs.userId, users.id))
      .where(
        and(
          eq(smStaffs.schoolId, ctx.tenant.schoolId),
          isNotNull(smStaffs.fullName)
        )
      );

    const parents = await ctx.db
      .select({
        recordId: smParents.id,
        userId: smParents.userId,
        fullName: smParents.guardiansName,
        fathersName: smParents.fathersName,
        mothersName: smParents.mothersName,
        email: users.email,
        fallbackEmail: smParents.guardiansEmail,
        phone: smParents.guardiansMobile,
        fathersMobile: smParents.fathersMobile,
        mothersMobile: smParents.mothersMobile,
        claimStatus: users.claimStatus,
        password: users.password,
        userActive: users.activeStatus,
        emailVerifiedAt: users.emailVerifiedAt
      })
      .from(smParents)
      .leftJoin(users, eq(smParents.userId, users.id))
      .where(eq(smParents.schoolId, ctx.tenant.schoolId));

    return [
      ...staff.map((row) => ({
        persona: "staff" as const,
        recordId: row.recordId,
        userId: row.userId,
        fullName: row.fullName,
        email: row.email ?? row.fallbackEmail,
        phone: row.phone,
        claimStatus: row.claimStatus,
        password: row.password,
        userActive: row.userActive,
        emailVerifiedAt: row.emailVerifiedAt
      })),
      ...parents.map((row) => ({
        persona: "parent" as const,
        recordId: row.recordId,
        userId: row.userId !== null && row.userId > 1 ? row.userId : null,
        fullName: row.fullName ?? row.fathersName ?? row.mothersName,
        email: row.email ?? row.fallbackEmail,
        phone: row.phone ?? row.fathersMobile ?? row.mothersMobile,
        claimStatus: row.claimStatus,
        password: row.password,
        userActive: row.userId !== null && row.userId > 1 ? row.userActive : null,
        emailVerifiedAt: row.emailVerifiedAt
      }))
    ];
  }, "listClaimDirectory");
}

export async function findParentClaimSubject(
  ctx: ScopedRepositoryContext,
  parentId: number
): Promise<ClaimSubjectRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: smParents.id,
        userId: smParents.userId,
        fullName: smParents.guardiansName,
        fathersName: smParents.fathersName,
        mothersName: smParents.mothersName,
        email: smParents.guardiansEmail
      })
      .from(smParents)
      .where(and(eq(smParents.id, parentId), eq(smParents.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    if (row === undefined) return null;
    return {
      subjectType: "parent",
      subjectId: row.id,
      userId: row.userId !== null && row.userId > 1 ? row.userId : null,
      fullName: row.fullName ?? row.fathersName ?? row.mothersName,
      email: row.email
    };
  }, "findParentClaimSubject");
}

export async function findStaffClaimSubject(
  ctx: ScopedRepositoryContext,
  staffId: number
): Promise<ClaimSubjectRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: smStaffs.id,
        userId: smStaffs.userId,
        fullName: smStaffs.fullName,
        email: smStaffs.email
      })
      .from(smStaffs)
      .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    if (row === undefined) return null;
    return {
      subjectType: "staff",
      subjectId: row.id,
      userId: row.userId,
      fullName: row.fullName,
      email: row.email
    };
  }, "findStaffClaimSubject");
}

/** Creates a pending user and links the persona in one D1 batch. */
export async function provisionSubjectUser(
  ctx: ScopedRepositoryContext,
  subject: ClaimSubjectRow
): Promise<number> {
  if (subject.userId !== null) return subject.userId;
  if (subject.email === null || subject.email.trim().length === 0) {
    throw new Error("The subject has no email address");
  }
  const email = subject.email.trim().toLowerCase();

  return withErrorHandling(async () => {
    const [existing] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.schoolId, ctx.tenant.schoolId), eq(users.email, email)))
      .limit(1);
    if (existing !== undefined) {
      await linkSubject(ctx, subject, existing.id);
      return existing.id;
    }

    await batchOrThrow(ctx.db, [
      ctx.db.insert(users).values({
        fullName: subject.fullName,
        email,
        schoolId: ctx.tenant.schoolId,
        activeStatus: 1,
        claimStatus: "pending",
        password: null
      }),
      ctx.db
        .update(subject.subjectType === "parent" ? smParents : smStaffs)
        .set({
          userId: sql`(SELECT id FROM users WHERE school_id = ${ctx.tenant.schoolId} AND email = ${email})`
        })
        .where(
          eq(
            subject.subjectType === "parent" ? smParents.id : smStaffs.id,
            subject.subjectId
          )
        )
    ]);

    const [created] = await ctx.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.schoolId, ctx.tenant.schoolId), eq(users.email, email)))
      .limit(1);
    if (created === undefined) throw new Error("Provisioned user was not found");
    return created.id;
  }, "provisionSubjectUser");
}

async function linkSubject(
  ctx: ScopedRepositoryContext,
  subject: ClaimSubjectRow,
  userId: number
): Promise<void> {
  await ctx.db
    .update(subject.subjectType === "parent" ? smParents : smStaffs)
    .set({ userId })
    .where(
      eq(
        subject.subjectType === "parent" ? smParents.id : smStaffs.id,
        subject.subjectId
      )
    );
}
