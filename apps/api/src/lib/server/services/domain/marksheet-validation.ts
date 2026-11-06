import {
  EXAM_MARK_MAXIMUMS,
  TITLES_BY_CATEGORY,
  type AssessmentCategory
} from "../../../constants/assessment";
import type { MarksheetAnnotation } from "../../../schema/marksheet-annotation";
import { getGrade, subjectPercentageMark } from "./grades";

export interface MarksheetValidationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface ComputedSubject {
  readonly subjectCode: string;
  readonly totalMarks: number;
  readonly fullMarks: number;
  readonly percentage: number;
  readonly grade: string;
}

export interface MarksheetValidationReport {
  readonly errors: readonly MarksheetValidationIssue[];
  readonly warnings: readonly MarksheetValidationIssue[];
  readonly computed: readonly ComputedSubject[];
  readonly hasErrors: boolean;
}

export interface ValidationContext {
  readonly expectedSubjects: readonly string[];
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly category: AssessmentCategory | null;
}

const normalize = (value: string): string => value.trim().toUpperCase();

export function validateMarksheetAnnotation(
  annotation: MarksheetAnnotation,
  context: ValidationContext
): MarksheetValidationReport {
  const errors: MarksheetValidationIssue[] = [];
  const warnings: MarksheetValidationIssue[] = [];
  const computed: ComputedSubject[] = [];
  const error = (code: string, path: string, message: string): void => {
    errors.push({ code, path, message, severity: "error" });
  };
  const warning = (code: string, path: string, message: string): void => {
    warnings.push({ code, path, message, severity: "warning" });
  };

  if (annotation.student.fullName.trim().length === 0) {
    error("missing_student_name", "student.fullName", "Student name is missing");
  }
  if (context.category !== null && annotation.student.category !== context.category) {
    warning(
      "category_mismatch",
      "student.category",
      `Paper category ${annotation.student.category} differs from class category ${context.category}`
    );
  }

  const attendance = annotation.attendance;
  if (attendance.daysOpened === null) error("missing_attendance", "attendance.daysOpened", "Days opened is blank");
  if (attendance.daysPresent === null) error("missing_attendance", "attendance.daysPresent", "Days present is blank");
  if (attendance.daysAbsent === null) error("missing_attendance", "attendance.daysAbsent", "Days absent is blank");
  if (
    attendance.daysOpened !== null &&
    attendance.daysPresent !== null &&
    attendance.daysAbsent !== null &&
    attendance.daysPresent + attendance.daysAbsent !== attendance.daysOpened
  ) {
    error(
      "attendance_mismatch",
      "attendance",
      `Present ${attendance.daysPresent} + absent ${attendance.daysAbsent} does not equal opened ${attendance.daysOpened}`
    );
  }

  const expected = new Set(context.expectedSubjects.map(normalize));
  const seenSubjects = new Set<string>();
  const expectedTitles = TITLES_BY_CATEGORY[annotation.student.category];
  const maxMarks = EXAM_MARK_MAXIMUMS[annotation.student.category];

  annotation.subjects.forEach((subject, subjectIndex) => {
    const subjectCode = normalize(subject.subjectCode);
    const subjectPath = `subjects[${subjectIndex}]`;
    if (seenSubjects.has(subjectCode)) {
      error("duplicate_subject", subjectPath, `Subject ${subjectCode} appears more than once`);
    }
    seenSubjects.add(subjectCode);
    if (expected.size > 0 && !expected.has(subjectCode)) {
      warning("unexpected_subject", subjectPath, `Subject ${subjectCode} is not assigned to this class`);
    }

    if (annotation.student.category === "DAYCARE") {
      if (subject.learningOutcome === null || subject.learningOutcome.trim().length === 0) {
        error("missing_learning_outcome", `${subjectPath}.learningOutcome`, "DAYCARE requires a learning outcome");
      }
      if (subject.marks.length > 0) {
        warning("daycare_marks_present", `${subjectPath}.marks`, "DAYCARE should not contain numeric marks");
      }
      computed.push({ subjectCode, totalMarks: 0, fullMarks: 0, percentage: 0, grade: "" });
      return;
    }

    const seenTitles = new Set<string>();
    let totalMarks = 0;
    let fullMarks = 0;

    subject.marks.forEach((mark, markIndex) => {
      const title = normalize(mark.title);
      const markPath = `${subjectPath}.marks[${markIndex}]`;
      if (seenTitles.has(title)) {
        error("duplicate_title", markPath, `Title ${title} appears more than once`);
      }
      seenTitles.add(title);
      if (!expectedTitles.includes(title)) {
        error("unknown_title", markPath, `Title ${title} is not valid for ${annotation.student.category}`);
        return;
      }
      const maximum = maxMarks[title] ?? 0;
      if (mark.value === null) {
        error("blank_mark", markPath, `Mark for ${title} is blank`);
        return;
      }
      if (mark.value < 0 || mark.value > maximum) {
        error("mark_out_of_range", markPath, `Mark ${mark.value} for ${title} must be between 0 and ${maximum}`);
        return;
      }
      totalMarks += mark.value;
      fullMarks += maximum;
    });

    for (const title of expectedTitles) {
      if (!seenTitles.has(title)) {
        error("missing_title", `${subjectPath}.marks`, `Missing ${title} for ${subjectCode}`);
      }
    }

    const percentage = subjectPercentageMark(totalMarks, fullMarks);
    computed.push({
      subjectCode,
      totalMarks,
      fullMarks,
      percentage,
      grade: getGrade(percentage, annotation.student.category).grade
    });
  });

  if (expected.size > 0) {
    for (const subjectCode of expected) {
      if (!seenSubjects.has(subjectCode)) {
        error("missing_subject", "subjects", `Assigned subject ${subjectCode} is missing`);
      }
    }
  }

  const seenRatings = new Set<string>();
  annotation.ratings.forEach((rating, index) => {
    const attribute = normalize(rating.attribute);
    if (seenRatings.has(attribute)) {
      warning("duplicate_rating", `ratings[${index}]`, `Rating ${attribute} appears more than once`);
    }
    seenRatings.add(attribute);
    if (rating.rate === null) {
      warning("blank_rating", `ratings[${index}].rate`, `Rating for ${attribute} is blank`);
    }
  });

  return { errors, warnings, computed, hasErrors: errors.length > 0 };
}
