import { and, eq, like, or, sql } from "drizzle-orm";

import { smStudents, studentRecords } from "../../../db/schema";
import { withErrorHandling } from "../../base/error-handling";
import { requireAcademicId } from "../../base/repository-context";
import type { ScopedRepositoryContext } from "../../base/repository-context";
import type { StudentSearchRow } from "./types";

export interface ClassSectionParams {
  readonly classId: number;
  readonly sectionId: number;
}

/**
 * Reads placement from the current/default `student_records` row, never from
 * the denormalized mirror on `sm_students`.
 */
export async function listStudentsByClassSection(
  ctx: ScopedRepositoryContext,
  params: ClassSectionParams,
  query?: string
): Promise<readonly StudentSearchRow[]> {
  if (params.classId <= 0 || params.sectionId <= 0) return [];
  return withErrorHandling(async () => {
    const conditions = [
      eq(studentRecords.classId, params.classId),
      eq(studentRecords.sectionId, params.sectionId),
      eq(studentRecords.academicId, requireAcademicId(ctx)),
      eq(studentRecords.activeStatus, 1),
      eq(studentRecords.isDefault, 1),
      eq(studentRecords.schoolId, ctx.tenant.schoolId),
      eq(smStudents.activeStatus, 1),
      eq(smStudents.schoolId, ctx.tenant.schoolId)
    ];

    const where =
      query === undefined || query.length === 0
        ? and(...conditions)
        : and(
            ...conditions,
            or(
              like(smStudents.fullName, `%${query}%`),
              like(sql`printf('%d', ${smStudents.admissionNo})`, `%${query}%`)
            )
          );

    return ctx.db
      .select({
        id: smStudents.id,
        name: smStudents.fullName,
        admissionNo: smStudents.admissionNo
      })
      .from(smStudents)
      .innerJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(where)
      .orderBy(smStudents.id);
  }, "listStudentsByClassSection");
}

/** Searches active students by name, restricted to the current placement. */
export async function searchStudents(
  ctx: ScopedRepositoryContext,
  query: string,
  filter: { readonly classId?: number; readonly sectionId?: number } = {}
): Promise<
  readonly {
    readonly studentId: number;
    readonly fullName: string | null;
    readonly admissionNo: number | null;
    readonly className: string | null;
    readonly sectionName: string | null;
    readonly activeStatus: number | null;
  }[]
> {
  return withErrorHandling(async () => {
    const conditions = [
      or(
        like(smStudents.fullName, `%${query}%`),
        like(sql`printf('%d', ${smStudents.admissionNo})`, `%${query}%`)
      ),
      eq(studentRecords.isDefault, 1),
      eq(studentRecords.academicId, requireAcademicId(ctx)),
      eq(studentRecords.schoolId, ctx.tenant.schoolId),
      eq(smStudents.schoolId, ctx.tenant.schoolId)
    ];
    if (filter.classId !== undefined) {
      conditions.push(eq(studentRecords.classId, filter.classId));
    }
    if (filter.sectionId !== undefined) {
      conditions.push(eq(studentRecords.sectionId, filter.sectionId));
    }

    return ctx.db
      .select({
        studentId: smStudents.id,
        fullName: smStudents.fullName,
        admissionNo: smStudents.admissionNo,
        className: sql<string | null>`(select class_name from sm_classes where sm_classes.id = ${studentRecords.classId})`,
        sectionName: sql<string | null>`(select section_name from sm_sections where sm_sections.id = ${studentRecords.sectionId})`,
        activeStatus: smStudents.activeStatus
      })
      .from(smStudents)
      .leftJoin(studentRecords, eq(smStudents.id, studentRecords.studentId))
      .where(and(...conditions))
      .limit(20);
  }, "searchStudents");
}
