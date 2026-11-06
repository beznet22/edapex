import { EXAM_MARK_MAXIMUMS } from "../../../constants/assessment";
import { getGrade, subjectPercentageMark } from "./grades";
import {
  examSetupKey,
  type MarksInputRow,
  type MarksPlan,
  type MarksPlanInput,
  type MissingExam,
  type MissingExamSetup,
  type PlannedMark,
  type PlannedResult
} from "./marks-types";

/**
 * Pure marks planner. The caller resolves exam ids and exam-setup ids first;
 * missing ids are returned so the service can create them and replan. A plan
 * with missing ids is never written.
 */
export function planMarks(input: MarksPlanInput): MarksPlan | null {
  const { student } = input;
  if (
    student.studentId <= 0 ||
    student.recordId <= 0 ||
    student.classId <= 0 ||
    student.sectionId <= 0 ||
    student.examTypeId <= 0
  ) {
    return null;
  }

  const teacherBySubject = new Map<number, number>();
  for (const assignment of input.assignments) {
    if (assignment.teacherId !== null && assignment.teacherId > 0) {
      teacherBySubject.set(assignment.subjectId, assignment.teacherId);
    }
  }

  const marks: PlannedMark[] = [];
  const results: PlannedResult[] = [];
  const marksInput: MarksInputRow[] = [];
  const missingExams: MissingExam[] = [];
  const missingSetups: MissingExamSetup[] = [];

  for (const entry of input.markStore) {
    const examId = input.exams.get(entry.subjectId);
    if (examId === undefined) {
      missingExams.push({ subjectId: entry.subjectId });
      continue;
    }

    const entries = Object.entries(entry.marks);
    if (input.category === "DAYCARE" && entries.length === 0) {
      results.push({
        studentRecordId: student.recordId,
        studentId: student.studentId,
        classId: student.classId,
        sectionId: student.sectionId,
        subjectId: entry.subjectId,
        examId,
        examTypeId: student.examTypeId,
        totalMarks: 0,
        teacherRemarks: entry.learningOutcome ?? null,
        academicId: student.academicId,
        schoolId: student.schoolId,
        activeStatus: 1
      });
      marksInput.push({
        subjectId: entry.subjectId,
        examTypeId: student.examTypeId,
        marks: 0,
        fullMarks: 0,
        totalMarks: 0,
        percentage: 0,
        grade: "",
        gpa: 0,
        isAbsent: false,
        ...(entry.learningOutcome !== undefined && entry.learningOutcome !== null
          ? { teacherRemarks: entry.learningOutcome }
          : {})
      });
      continue;
    }

    const subjectMarks: PlannedMark[] = [];
    let totalMarks = 0;
    let totalFullMarks = 0;
    let missing = false;
    const teacherId = teacherBySubject.get(entry.subjectId) ?? 0;

    for (const [title, score] of entries) {
      const fullMarks = EXAM_MARK_MAXIMUMS[input.category][title.toUpperCase()] ?? 100;
      const setupId = input.examSetups.get(examSetupKey(entry.subjectId, title));
      if (setupId === undefined) {
        missingSetups.push({ subjectId: entry.subjectId, title, fullMarks });
        missing = true;
        continue;
      }
      subjectMarks.push({
        studentRecordId: student.recordId,
        studentId: student.studentId,
        classId: student.classId,
        sectionId: student.sectionId,
        subjectId: entry.subjectId,
        examTermId: student.examTypeId,
        examSetupId: setupId,
        totalMarks: score,
        isAbsent: 0,
        academicId: student.academicId,
        schoolId: student.schoolId,
        teacherId,
        activeStatus: 1
      });
      totalMarks += score;
      totalFullMarks += fullMarks;
    }

    if (missing) continue;

    const percentage = subjectPercentageMark(totalMarks, totalFullMarks);
    marks.push(...subjectMarks);
    results.push({
      studentRecordId: student.recordId,
      studentId: student.studentId,
      classId: student.classId,
      sectionId: student.sectionId,
      subjectId: entry.subjectId,
      examId,
      examTypeId: student.examTypeId,
      totalMarks,
      teacherRemarks:
        input.category === "DAYCARE" ? (entry.learningOutcome ?? null) : null,
      academicId: student.academicId,
      schoolId: student.schoolId,
      activeStatus: 1
    });
    marksInput.push({
      subjectId: entry.subjectId,
      examTypeId: student.examTypeId,
      marks: totalMarks,
      fullMarks: totalFullMarks,
      totalMarks,
      percentage,
      grade: getGrade(percentage, input.category).grade,
      gpa: 0,
      isAbsent: false,
      ...(input.category === "DAYCARE" &&
      entry.learningOutcome !== undefined &&
      entry.learningOutcome !== null
        ? { teacherRemarks: entry.learningOutcome }
        : {})
    });
  }

  return { marks, results, marksInput, missingExams, missingSetups };
}
