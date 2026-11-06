import { and, eq } from "drizzle-orm";

import { smAssignSubjects, smSubjects } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface SubjectByClassRow {
  readonly id: number;
  readonly subjectCode: string | null;
  readonly subjectName: string;
  readonly teacherId: number | null;
}

export async function listSubjectsByClass(
  ctx: ScopedRepositoryContext,
  classId: number,
  sectionId: number
): Promise<readonly SubjectByClassRow[]> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    return ctx.db
      .select({
        id: smSubjects.id,
        subjectCode: smSubjects.subjectCode,
        subjectName: smSubjects.subjectName,
        teacherId: smAssignSubjects.teacherId
      })
      .from(smSubjects)
      .leftJoin(smAssignSubjects, eq(smSubjects.id, smAssignSubjects.subjectId))
      .where(
        and(
          eq(smAssignSubjects.classId, classId),
          eq(smAssignSubjects.sectionId, sectionId),
          eq(smAssignSubjects.academicId, academicId),
          eq(smAssignSubjects.schoolId, ctx.tenant.schoolId),
          eq(smSubjects.schoolId, ctx.tenant.schoolId),
          eq(smSubjects.activeStatus, 1)
        )
      )
      .orderBy(smSubjects.subjectName);
  }, "listSubjectsByClass");
}
