import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import {
  smAcademicYears,
  smAssignSubjects,
  smBaseSetups,
  smClasses,
  smExamSetups,
  smParents,
  smSchools,
  smSections,
  smStudentCategories,
  smStudents,
  smSubjects,
  studentRecords,
} from "$lib/server/db/sms-schema";
import { base64url } from "$lib/server/mastra/tools/operations/parent";
import { SettingsService } from "$lib/server/service/settings.service";
import { categoryEnum, type Category, type Marksheet } from "$lib/schema/marksheet";
import type { ScannerSubject } from "./scan-mapper";

/**
 * All DB-derived inputs to a `Marksheet`, loaded once so the extraction route (validation) and
 * the commit route (persistence) cannot disagree about what the database says.
 */

export interface ScanFacts {
  category: Category;
  classId: number;
  sectionId: number;
  examTitles: string[] | null;
  assignedSubjects: ScannerSubject[];
  school: Marksheet["school"];
  /** Category and attendance are added by the mapper, which owns those fields. */
  student: Omit<
    Marksheet["student"],
    "category" | "daysOpened" | "daysPresent" | "daysAbsent"
  >;
}

/**
 * `categoryEnum.parse` runs on commit, and the paper prints `CRECHE`, which is not a member.
 * Every failure here is a hard error: a guessed category would persist wrong marks.
 */
export const toCategory = (name: string | null, studentId: number): Category => {
  const normalised = (name ?? "").toUpperCase().replace(/\s+/g, "");
  const parsed = categoryEnum.safeParse(normalised);
  if (!parsed.success) {
    throw new Error(`Student ${studentId} has no recognised category (found "${name ?? "null"}")`);
  }
  return parsed.data;
};

const uniqueTitles = (titles: (string | null)[]): string[] => {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const title of titles) {
    const value = (title ?? "").trim().toUpperCase();
    if (value === "" || seen.has(value)) continue;
    seen.add(value);
    ordered.push(value);
  }
  return ordered;
};

export async function loadScanFacts(input: {
  studentId: number;
  examTypeId: number;
  schoolId: number;
  academicId: number;
}): Promise<ScanFacts> {
  const db = await getDatabase();

  const [studentRow] = await db
    .select({
      id: smStudents.id,
      fullName: smStudents.fullName,
      genderId: smStudents.genderId,
      admissionNo: smStudents.admissionNo,
      parentId: smStudents.parentId,
      categoryName: smStudentCategories.categoryName,
      classId: studentRecords.classId,
      sectionId: studentRecords.sectionId,
      className: smClasses.className,
      sectionName: smSections.sectionName,
    })
    .from(smStudents)
    .leftJoin(
      studentRecords,
      and(
        eq(studentRecords.studentId, smStudents.id),
        eq(studentRecords.academicId, input.academicId),
        eq(studentRecords.schoolId, input.schoolId)
      )
    )
    .leftJoin(smClasses, eq(smClasses.id, studentRecords.classId))
    .leftJoin(smSections, eq(smSections.id, studentRecords.sectionId))
    .leftJoin(smStudentCategories, eq(smStudentCategories.id, smStudents.studentCategoryId))
    .where(and(eq(smStudents.id, input.studentId), eq(smStudents.schoolId, input.schoolId)))
    .limit(1);

  if (!studentRow) throw new Error("Student not found");
  if (studentRow.classId === null || studentRow.sectionId === null) {
    throw new Error("Student has no roster row for the active year");
  }

  const [genderRow] = studentRow.genderId
    ? await db
        .select({ name: smBaseSetups.baseSetupName })
        .from(smBaseSetups)
        .where(eq(smBaseSetups.id, studentRow.genderId))
        .limit(1)
    : [];

  const [parentRow] = studentRow.parentId
    ? await db
        .select({ email: smParents.guardiansEmail, name: smParents.guardiansName })
        .from(smParents)
        .where(eq(smParents.id, studentRow.parentId))
        .limit(1)
    : [];

  const [yearRow] = await db
    .select({ year: smAcademicYears.year, title: smAcademicYears.title })
    .from(smAcademicYears)
    .where(eq(smAcademicYears.id, input.academicId))
    .limit(1);

  const subjectRows = await db
    .select({
      subjectId: smSubjects.id,
      subjectCode: smSubjects.subjectCode,
      subjectName: smSubjects.subjectName,
    })
    .from(smAssignSubjects)
    .innerJoin(smSubjects, eq(smSubjects.id, smAssignSubjects.subjectId))
    .where(
      and(
        eq(smAssignSubjects.classId, studentRow.classId),
        eq(smAssignSubjects.sectionId, studentRow.sectionId),
        eq(smAssignSubjects.academicId, input.academicId)
      )
    )
    .groupBy(smSubjects.id);

  const examTitleRows = await db
    .select({ examTitle: smExamSetups.examTitle })
    .from(smExamSetups)
    .where(
      and(
        eq(smExamSetups.classId, studentRow.classId),
        eq(smExamSetups.sectionId, studentRow.sectionId),
        eq(smExamSetups.academicId, input.academicId),
        eq(smExamSetups.examTermId, input.examTypeId)
      )
    );

  const [schoolRow] = await db
    .select({
      schoolName: smSchools.schoolName,
      email: smSchools.email,
      phone: smSchools.phone,
    })
    .from(smSchools)
    .where(eq(smSchools.id, input.schoolId))
    .limit(1);

  const reportSettings = await new SettingsService(input.schoolId).getReportSettings();
  const examTitles = uniqueTitles(examTitleRows.map((row) => row.examTitle));

  return {
    category: toCategory(studentRow.categoryName, input.studentId),
    classId: studentRow.classId,
    sectionId: studentRow.sectionId,
    examTitles: examTitles.length > 0 ? examTitles : null,
    assignedSubjects: subjectRows.map((row) => ({
      subjectId: row.subjectId,
      subjectCode: row.subjectCode,
      subjectName: row.subjectName,
    })),
    school: {
      id: input.schoolId,
      name: schoolRow?.schoolName ?? "",
      email: schoolRow?.email ?? "",
      phone: schoolRow?.phone ?? "",
      city: "",
      state: "",
      title: reportSettings.termlyReportTitle,
      vacation_date: "",
    },
    student: {
      id: studentRow.id,
      examTypeId: input.examTypeId,
      fullName: studentRow.fullName ?? "",
      gender: genderRow?.name ?? "",
      parentEmail: parentRow?.email ?? "",
      parentName: parentRow?.name ?? "",
      term: yearRow?.title ?? "",
      title: reportSettings.termlyReportTitle,
      className: studentRow.className ?? "",
      sectionName: studentRow.sectionName ?? "",
      adminNo: studentRow.admissionNo ?? 0,
      sessionYear: yearRow?.year ?? String(input.academicId),
      token: base64url(
        JSON.stringify({
          studentId: input.studentId,
          examTypeId: input.examTypeId,
          academicId: input.academicId,
          schoolId: input.schoolId,
        })
      ),
    },
  };
}
