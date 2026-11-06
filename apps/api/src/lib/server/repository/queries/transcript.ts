import { and, asc, eq } from "drizzle-orm";

import {
  smAcademicYears,
  smExamTypes,
  smGeneralSettings,
  smResultStores,
  smSubjects
} from "../../db/schema";
import { chunkedInArray } from "../base/d1-helpers";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ClassResultReadRow, ResultRecordReadRow } from "./result-read";

const isAverageTerm = (raw: string | null): boolean => {
  if (raw === null) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return false;
    if (!("isAverage" in parsed)) return false;
    return parsed.isAverage === true || parsed.isAverage === 1;
  } catch {
    return false;
  }
};

export interface TranscriptTerm {
  readonly id: number;
  readonly name: string;
  readonly sequence: number;
  readonly legacySuffix: string | null;
}

export interface TranscriptData {
  readonly terms: readonly TranscriptTerm[];
  readonly academicYear: { readonly id: number; readonly title: string; readonly year: string } | null;
  readonly school: {
    readonly schoolName: string | null;
    readonly email: string | null;
    readonly phone: string | null;
    readonly address: string | null;
    readonly logo: string | null;
  } | null;
  readonly records: readonly ResultRecordReadRow[];
  readonly classResults: readonly ClassResultReadRow[];
}

/** Cross-session transcript; reads assessments, school settings and subjects. */
export async function getTranscriptData(
  ctx: ScopedRepositoryContext,
  studentId: number,
  academicId: number
): Promise<TranscriptData> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;

    const allTerms = await ctx.db
      .select({
        id: smExamTypes.id,
        name: smExamTypes.name,
        sequence: smExamTypes.sequence,
        legacySuffix: smExamTypes.legacySuffix,
        grading: smExamTypes.grading
      })
      .from(smExamTypes)
      .where(
        and(
          eq(smExamTypes.academicId, academicId),
          eq(smExamTypes.activeStatus, 1),
          eq(smExamTypes.schoolId, schoolId)
        )
      )
      .orderBy(asc(smExamTypes.sequence));

    const terms: TranscriptTerm[] = allTerms
      .filter((term) => !isAverageTerm(term.grading))
      .map((term) => ({
        id: term.id,
        name: term.name,
        sequence: term.sequence,
        legacySuffix: term.legacySuffix
      }));

    const [academicYear] = await ctx.db
      .select({ id: smAcademicYears.id, title: smAcademicYears.title, year: smAcademicYears.year })
      .from(smAcademicYears)
      .where(and(eq(smAcademicYears.id, academicId), eq(smAcademicYears.schoolId, schoolId)))
      .limit(1);

    const [school] = await ctx.db
      .select({
        schoolName: smGeneralSettings.schoolName,
        email: smGeneralSettings.email,
        phone: smGeneralSettings.phone,
        address: smGeneralSettings.address,
        logo: smGeneralSettings.logo
      })
      .from(smGeneralSettings)
      .where(eq(smGeneralSettings.schoolId, schoolId))
      .limit(1);

    const termIds = terms.map((term) => term.id);
    if (termIds.length === 0) {
      return {
        terms,
        academicYear: academicYear ?? null,
        school: school ?? null,
        records: [],
        classResults: []
      };
    }

    const [enrolment] = await ctx.db
      .select({ classId: smResultStores.classId, sectionId: smResultStores.sectionId })
      .from(smResultStores)
      .where(
        and(
          eq(smResultStores.studentId, studentId),
          eq(smResultStores.academicId, academicId),
          eq(smResultStores.schoolId, schoolId)
        )
      )
      .limit(1);

    const records: ResultRecordReadRow[] = [];
    const classResults: ClassResultReadRow[] = [];
    for (const predicate of chunkedInArray(smResultStores.examTypeId, termIds)) {
      records.push(
        ...(await ctx.db
          .select({
            studentId: smResultStores.studentId,
            resultId: smResultStores.id,
            subjectId: smResultStores.subjectId,
            subjectName: smSubjects.subjectName,
            subjectCode: smSubjects.subjectCode,
            teacherRemarks: smResultStores.teacherRemarks
          })
          .from(smResultStores)
          .leftJoin(smSubjects, eq(smResultStores.subjectId, smSubjects.id))
          .where(
            and(
              eq(smResultStores.studentId, studentId),
              eq(smResultStores.academicId, academicId),
              eq(smResultStores.activeStatus, 1),
              eq(smResultStores.schoolId, schoolId),
              predicate
            )
          ))
      );

      if (
        enrolment?.classId !== null &&
        enrolment?.classId !== undefined &&
        enrolment.sectionId !== null
      ) {
        classResults.push(
          ...(await ctx.db
            .select({
              studentId: smResultStores.studentId,
              resultId: smResultStores.id,
              subjectId: smResultStores.subjectId,
              totalMarks: smResultStores.totalMarks,
              totalGpaGrade: smResultStores.totalGpaGrade,
              examTypeId: smResultStores.examTypeId
            })
            .from(smResultStores)
            .where(
              and(
                eq(smResultStores.classId, enrolment.classId),
                eq(smResultStores.sectionId, enrolment.sectionId),
                eq(smResultStores.academicId, academicId),
                eq(smResultStores.activeStatus, 1),
                eq(smResultStores.schoolId, schoolId),
                predicate
              )
            ))
        );
      }
    }

    return {
      terms,
      academicYear: academicYear ?? null,
      school: school ?? null,
      records,
      classResults
    };
  }, "getTranscriptData");
}
