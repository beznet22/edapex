import { and, eq, sql } from "drizzle-orm";

import { smParents, smStaffs, users } from "../../db/schema";
import { batchOrThrow } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type {
  ClaimSubjectRow,
  ScopedRepositoryContext
} from "../base/repository-context";

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
