import { and, eq, like } from "drizzle-orm";

import { smParents, smStudents } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ParentStudentRow {
  readonly id: number;
  readonly parentId: number;
  readonly guardiansName: string | null;
  readonly guardiansEmail: string | null;
  readonly userId: number | null;
  readonly studentName: string | null;
}

export interface ParentStudentSearchRow extends ParentStudentRow {
  readonly admissionNo: number | null;
}

const searchPattern = (query: string): string =>
  `%${query.trim().replace(/\s+/g, "%")}%`;

/** Reads parents joined to students: two mutable aggregates, so a query module. */
export async function findParentByStudentId(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<ParentStudentRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: smParents.id,
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId,
        studentName: smStudents.fullName
      })
      .from(smParents)
      .innerJoin(smStudents, eq(smParents.id, smStudents.parentId))
      .where(
        and(
          eq(smStudents.id, studentId),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId),
          eq(smParents.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findParentByStudentId");
}

export async function findParentByAdmissionNo(
  ctx: ScopedRepositoryContext,
  admissionNo: number
): Promise<ParentStudentRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        id: smParents.id,
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId,
        studentName: smStudents.fullName
      })
      .from(smParents)
      .innerJoin(smStudents, eq(smParents.id, smStudents.parentId))
      .where(
        and(
          eq(smStudents.admissionNo, admissionNo),
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId),
          eq(smParents.schoolId, ctx.tenant.schoolId)
        )
      )
      .limit(1);
    return row ?? null;
  }, "findParentByAdmissionNo");
}

export async function searchParentsByStudentName(
  ctx: ScopedRepositoryContext,
  studentName: string
): Promise<readonly ParentStudentSearchRow[]> {
  return withErrorHandling(async () => {
    const pattern = searchPattern(studentName);
    return ctx.db
      .select({
        id: smParents.id,
        parentId: smParents.id,
        guardiansName: smParents.guardiansName,
        guardiansEmail: smParents.guardiansEmail,
        userId: smParents.userId,
        studentName: smStudents.fullName,
        admissionNo: smStudents.admissionNo
      })
      .from(smParents)
      .innerJoin(smStudents, eq(smParents.id, smStudents.parentId))
      .where(
        and(
          eq(smStudents.activeStatus, 1),
          eq(smStudents.schoolId, ctx.tenant.schoolId),
          eq(smParents.schoolId, ctx.tenant.schoolId),
          like(smStudents.fullName, pattern)
        )
      )
      .limit(10);
  }, "searchParentsByStudentName");
}
