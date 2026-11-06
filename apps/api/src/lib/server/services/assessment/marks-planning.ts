import {
  EXAM_MARK_MAXIMUMS,
  TITLES_BY_CATEGORY,
  type AssessmentCategory
} from "../../../constants/assessment";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";
import {
  examSetupKey,
  planMarks,
  type MarkStoreEntry,
  type MarksPlan
} from "../domain";

export interface Placement {
  readonly studentId: number;
  readonly recordId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly schoolId: number;
  readonly academicId: number;
  readonly categoryId: number | null;
  readonly fullName: string | null;
}

export interface ExpectedPlacement {
  readonly classId?: number;
  readonly sectionId?: number;
  readonly recordId?: number;
}

export async function loadPlacement(
  ctx: ServiceContext,
  studentId: number,
  expected?: ExpectedPlacement
): Promise<Placement> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const details = await ctx.repos.queries.findStudentDetails(scoped, studentId);
  if (
    details === null ||
    details.studentRecordId === null ||
    details.classId === null ||
    details.sectionId === null ||
    details.academicId === null
  ) {
    throw new ValidationError(`Student ${studentId} has no current placement`, "studentId");
  }
  if (expected?.classId !== undefined && expected.classId !== details.classId) {
    throw new ValidationError("Class does not match the student's current placement", "classId");
  }
  if (expected?.sectionId !== undefined && expected.sectionId !== details.sectionId) {
    throw new ValidationError("Section does not match the student's current placement", "sectionId");
  }
  if (expected?.recordId !== undefined && expected.recordId !== details.studentRecordId) {
    throw new ValidationError("Record does not match the student's current placement", "recordId");
  }
  return {
    studentId,
    recordId: details.studentRecordId,
    classId: details.classId,
    sectionId: details.sectionId,
    schoolId: details.schoolId ?? scoped.tenant.schoolId,
    academicId: details.academicId,
    categoryId: details.studentCategoryId,
    fullName: details.fullName
  };
}

export async function resolveMarksPlan(
  ctx: ServiceContext,
  placement: Placement,
  category: AssessmentCategory,
  examTypeId: number,
  markStore: readonly MarkStoreEntry[]
): Promise<MarksPlan> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  if (markStore.length === 0) {
    throw new ValidationError("No marks or results were supplied", "marksData");
  }
  for (const entry of markStore) {
    if (entry.subjectId <= 0) {
      throw new ValidationError("Every mark row needs a subject id", "marksData");
    }
  }

  const seenSubjects = new Set<number>();
  const allowedTitles = TITLES_BY_CATEGORY[category];
  for (const entry of markStore) {
    if (seenSubjects.has(entry.subjectId)) {
      throw new ValidationError("A subject appears more than once", "marksData");
    }
    seenSubjects.add(entry.subjectId);
    if (category === "DAYCARE") {
      if (Object.keys(entry.marks).length > 0) {
        throw new ValidationError("DAYCARE must not contain numeric marks", "marksData");
      }
      if (entry.learningOutcome === undefined || entry.learningOutcome === null || entry.learningOutcome.trim().length === 0) {
        throw new ValidationError("DAYCARE requires a learning outcome", "marksData");
      }
      continue;
    }
    for (const [title, value] of Object.entries(entry.marks)) {
      const normalized = title.trim().toUpperCase();
      if (!allowedTitles.includes(normalized)) {
        throw new ValidationError(`Title ${title} is not valid for ${category}`, "marksData");
      }
      const maximum = EXAM_MARK_MAXIMUMS[category][normalized] ?? 0;
      if (!Number.isInteger(value) || value < 0 || value > maximum) {
        throw new ValidationError(
          `Mark ${value} for ${title} must be an integer between 0 and ${maximum}`,
          "marksData"
        );
      }
    }
  }

  const assignments = await ctx.repos.academics.listAssignedSubjects(
    scoped,
    placement.classId,
    placement.sectionId
  );
  const examRows = await ctx.repos.assessments.listExamsByClassSection(
    scoped,
    placement.classId,
    placement.sectionId,
    examTypeId
  );
  const exams = new Map<number, number>();
  for (const row of examRows) {
    if (row.subjectId !== null) exams.set(row.subjectId, row.id);
  }
  for (const entry of markStore) {
    if (!exams.has(entry.subjectId)) {
      exams.set(
        entry.subjectId,
        await ctx.repos.assessments.ensureExam(scoped, {
          classId: placement.classId,
          sectionId: placement.sectionId,
          subjectId: entry.subjectId,
          examTypeId
        })
      );
    }
  }

  const setupRows = await ctx.repos.assessments.findExamSetupsByClassSection(
    scoped,
    placement.classId,
    placement.sectionId,
    examTypeId
  );
  const examSetups = new Map<string, number>();
  for (const row of setupRows) {
    if (
      row.id !== undefined &&
      row.subjectId !== undefined &&
      row.subjectId !== null &&
      row.examTitle !== undefined &&
      row.examTitle !== null
    ) {
      examSetups.set(examSetupKey(row.subjectId, row.examTitle), row.id);
    }
  }
  for (const entry of markStore) {
    for (const title of Object.keys(entry.marks)) {
      const key = examSetupKey(entry.subjectId, title);
      if (examSetups.has(key)) continue;
      const examId = exams.get(entry.subjectId);
      if (examId === undefined) continue;
      const examMark = EXAM_MARK_MAXIMUMS[category][title.toUpperCase()] ?? 100;
      examSetups.set(
        key,
        await ctx.repos.assessments.upsertExamSetup(scoped, {
          examTitle: title,
          examId,
          examTermId: examTypeId,
          subjectId: entry.subjectId,
          classId: placement.classId,
          sectionId: placement.sectionId,
          examMark,
          activeStatus: 1
        })
      );
    }
  }

  const plan = planMarks({
    student: {
      studentId: placement.studentId,
      recordId: placement.recordId,
      classId: placement.classId,
      sectionId: placement.sectionId,
      schoolId: placement.schoolId,
      academicId: placement.academicId,
      examTypeId
    },
    category,
    markStore,
    assignments: assignments.map((row) => ({
      subjectId: row.subjectId,
      teacherId: row.teacherId
    })),
    exams,
    examSetups
  });
  if (plan === null) {
    throw new ValidationError("Marks could not be processed for this placement", "marksData");
  }
  if (plan.missingExams.length > 0 || plan.missingSetups.length > 0) {
    throw new ValidationError("Marks reference an unresolved exam or exam setup", "marksData");
  }
  if (plan.marks.length === 0 && plan.results.length === 0) {
    throw new ValidationError("No marks or results were processed", "marksData");
  }
  return plan;
}
