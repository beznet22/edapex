import { and, asc, eq, gt, sql } from "drizzle-orm";

import {
  smClasses,
  smExamTypes,
  smSections,
  smStudents,
  studentRecords
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ArchiveStudentRow {
  readonly studentId: number;
  readonly studentRecordId: number;
  readonly admissionNo: number | null;
  readonly fullName: string | null;
  readonly studentPhoto: string | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly recordStatus: string;
}

export interface SessionTermRow {
  readonly id: number;
  readonly name: string;
  readonly sequence: number;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly legacySuffix: string | null;
}

/** Keyset page of the session's students; inactive students are still archived. */
export async function listArchiveStudents(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicId: number;
    readonly afterStudentId?: number;
    readonly limit: number;
  }
): Promise<readonly ArchiveStudentRow[]> {
  return withErrorHandling(async () => {
    const after =
      params.afterStudentId === undefined
        ? undefined
        : gt(studentRecords.studentId, params.afterStudentId);
    const rows = await ctx.db
      .select({
        studentId: smStudents.id,
        studentRecordId: studentRecords.id,
        admissionNo: smStudents.admissionNo,
        fullName: smStudents.fullName,
        studentPhoto: smStudents.studentPhoto,
        classId: studentRecords.classId,
        sectionId: studentRecords.sectionId,
        className: smClasses.className,
        sectionName: smSections.sectionName,
        recordStatus: studentRecords.status
      })
      .from(studentRecords)
      .innerJoin(smStudents, eq(studentRecords.studentId, smStudents.id))
      .leftJoin(smClasses, eq(studentRecords.classId, smClasses.id))
      .leftJoin(smSections, eq(studentRecords.sectionId, smSections.id))
      .where(
        and(
          eq(studentRecords.schoolId, ctx.tenant.schoolId),
          eq(studentRecords.academicId, params.academicId),
          eq(studentRecords.activeStatus, 1),
          after
        )
      )
      .orderBy(asc(studentRecords.studentId), asc(studentRecords.id))
      .limit(params.limit);

    const seen = new Set<number>();
    const deduped: ArchiveStudentRow[] = [];
    for (const row of rows) {
      if (seen.has(row.studentId)) continue;
      seen.add(row.studentId);
      deduped.push(row);
    }
    return deduped;
  }, "listArchiveStudents");
}

export async function countArchiveStudents(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<number> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ value: sql<number>`count(distinct ${studentRecords.studentId})` })
      .from(studentRecords)
      .where(
        and(
          eq(studentRecords.schoolId, ctx.tenant.schoolId),
          eq(studentRecords.academicId, academicId),
          eq(studentRecords.activeStatus, 1)
        )
      );
    return Number(row?.value ?? 0);
  }, "countArchiveStudents");
}

export async function listSessionTerms(
  ctx: ScopedRepositoryContext,
  academicId: number
): Promise<readonly SessionTermRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({
          id: smExamTypes.id,
          name: smExamTypes.name,
          sequence: smExamTypes.sequence,
          startsOn: smExamTypes.startsOn,
          endsOn: smExamTypes.endsOn,
          legacySuffix: smExamTypes.legacySuffix
        })
        .from(smExamTypes)
        .where(
          and(
            eq(smExamTypes.schoolId, ctx.tenant.schoolId),
            eq(smExamTypes.academicId, academicId),
            eq(smExamTypes.activeStatus, 1)
          )
        )
        .orderBy(asc(smExamTypes.sequence)),
    "listSessionTerms"
  );
}
