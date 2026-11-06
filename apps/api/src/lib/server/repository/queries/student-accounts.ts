import { and, eq, or } from "drizzle-orm";

import { smClasses, smSections, smStudents } from "../../db/schema";
import { chunkedInArray } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

/** The student → account mapping the code flow needs before a tenant exists. */
export interface StudentUserLink {
  readonly studentId: number;
  readonly userId: number | null;
  readonly fullName: string | null;
  readonly admissionNo: number | null;
}

export interface StudentCodeExportRow extends StudentUserLink {
  readonly className: string | null;
  readonly sectionName: string | null;
}

/** `auth_codes` has no school column (`04 §2`); scope comes from these ids. */
export async function resolveStudentUsers(
  ctx: ScopedRepositoryContext,
  studentIds: readonly number[]
): Promise<readonly StudentUserLink[]> {
  const predicates = chunkedInArray(smStudents.id, studentIds);
  if (predicates.length === 0) return [];
  return withErrorHandling(
    async () =>
      ctx.db
        .select({
          studentId: smStudents.id,
          userId: smStudents.userId,
          fullName: smStudents.fullName,
          admissionNo: smStudents.admissionNo
        })
        .from(smStudents)
        .where(and(eq(smStudents.schoolId, ctx.tenant.schoolId), or(...predicates))),
    "resolveStudentUsers"
  );
}

export async function listStudentCodeExportRows(
  ctx: ScopedRepositoryContext,
  studentIds: readonly number[]
): Promise<readonly StudentCodeExportRow[]> {
  const predicates = chunkedInArray(smStudents.id, studentIds);
  if (predicates.length === 0) return [];
  return withErrorHandling(
    async () =>
      ctx.db
        .select({
          studentId: smStudents.id,
          userId: smStudents.userId,
          fullName: smStudents.fullName,
          admissionNo: smStudents.admissionNo,
          className: smClasses.className,
          sectionName: smSections.sectionName
        })
        .from(smStudents)
        .leftJoin(smClasses, eq(smStudents.classId, smClasses.id))
        .leftJoin(smSections, eq(smStudents.sectionId, smSections.id))
        .where(and(eq(smStudents.schoolId, ctx.tenant.schoolId), or(...predicates)))
        .orderBy(smStudents.classId, smStudents.sectionId, smStudents.admissionNo),
    "listStudentCodeExportRows"
  );
}
