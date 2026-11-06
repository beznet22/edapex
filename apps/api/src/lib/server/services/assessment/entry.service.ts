import { AttributeRemark, type AssessmentCategory } from "../../../constants/assessment";
import { marksheetSchema, type Marksheet } from "../../../schema/marksheet";
import type { ServiceContext } from "../context";
import { assertSessionWritable } from "../tenant/session-writable";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";
import type { MarkStoreEntry, MarksInputRow } from "../domain";
import { parseOrThrow } from "../validation";
import { loadPlacement, resolveMarksPlan, type Placement } from "./marks-planning";

export interface AttendanceInput {
  readonly daysOpened: number;
  readonly daysAbsent: number;
  readonly daysPresent: number;
}

export interface StudentResultInput {
  readonly studentData: {
    readonly studentId: number;
    readonly classId: number;
    readonly sectionId: number;
    readonly recordId?: number;
    readonly examTypeId: number;
    readonly studentCategory: AssessmentCategory;
    readonly studentCategoryId?: number;
    readonly attendance?: AttendanceInput;
  };
  readonly marksData: readonly MarkStoreEntry[];
  readonly teachersRemark?: { readonly comment: string | null };
  readonly studentRatings?: Readonly<Record<string, number | null>>;
}

export interface MarkResponse {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly results: readonly MarksInputRow[];
}

const ratingRemark = (rate: number): string | null => {
  const entry = Object.entries(AttributeRemark).find(([key]) => Number(key) === rate);
  return entry?.[1] ?? null;
};

export class AssessmentEntryService {
  constructor(private readonly ctx: ServiceContext) {}

  private async writeFeedback(
    placement: Placement,
    examTypeId: number,
    staffId: number,
    ratings: readonly { attribute: string; rate: number; remark: string | null; color: string | null }[],
    remark: string | null,
    attendance: AttendanceInput | undefined
  ): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (ratings.length > 0) {
      await this.ctx.repos.assessments.upsertStudentRatings(
        scoped,
        ratings.map((rating) => ({
          studentId: placement.studentId,
          examTypeId,
          attribute: rating.attribute,
          rate: rating.rate,
          remark: rating.remark,
          color: rating.color,
          schoolId: placement.schoolId,
          activeStatus: 1
        }))
      );
    }
    if (remark !== null && remark.trim().length > 0) {
      await this.ctx.repos.assessments.upsertTeacherRemark(scoped, {
        studentId: placement.studentId,
        examTypeId,
        remark,
        teacherId: staffId
      });
    }
    if (attendance !== undefined) {
      await this.ctx.repos.attendance.upsertClassAttendance(scoped, {
        studentId: placement.studentId,
        examTypeId,
        daysOpened: attendance.daysOpened,
        daysAbsent: attendance.daysAbsent,
        daysPresent: attendance.daysPresent
      });
    }
  }

  async upsertStudentResult(
    input: StudentResultInput,
    staffId: number
  ): Promise<MarkResponse> {
    await assertSessionWritable(this.ctx);
    if (!Number.isInteger(staffId) || staffId <= 0) {
      throw new ValidationError("A positive staff id is required", "staffId");
    }
    const { studentData } = input;
    if (studentData.studentId <= 0 || studentData.examTypeId <= 0) {
      throw new ValidationError("Student id and exam type id are required", "studentData");
    }

    const placement = await loadPlacement(this.ctx, studentData.studentId, {
      classId: studentData.classId,
      sectionId: studentData.sectionId,
      ...(studentData.recordId === undefined ? {} : { recordId: studentData.recordId })
    });
    const plan = await resolveMarksPlan(
      this.ctx,
      placement,
      studentData.studentCategory,
      studentData.examTypeId,
      input.marksData
    );
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.assessments.replaceMarksAndResults(scoped, plan.marks, plan.results);

    if (
      studentData.studentCategoryId !== undefined &&
      studentData.studentCategoryId !== placement.categoryId
    ) {
      await this.ctx.repos.profiles.updateStudentCategoryId(
        scoped,
        studentData.studentId,
        studentData.studentCategoryId
      );
    }

    const ratings = Object.entries(input.studentRatings ?? {})
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([attribute, rate]) => ({
        attribute,
        rate,
        remark: ratingRemark(rate),
        color: null
      }));
    await this.writeFeedback(
      placement,
      studentData.examTypeId,
      staffId,
      ratings,
      input.teachersRemark?.comment ?? null,
      studentData.attendance
    );

    return {
      studentId: studentData.studentId,
      examTypeId: studentData.examTypeId,
      results: plan.marksInput
    };
  }

  async upsertMarksheet(marksheet: Marksheet, staffId: number): Promise<Marksheet> {
    await assertSessionWritable(this.ctx);
    if (!Number.isInteger(staffId) || staffId <= 0) {
      throw new ValidationError("A positive staff id is required", "staffId");
    }
    const parsed = await parseOrThrow(
      () => marksheetSchema.parseAsync(marksheet),
      "Marksheet validation failed"
    );
    const studentId = parsed.student.id;
    const examTypeId = parsed.examType?.id ?? parsed.student.examTypeId;
    if (studentId <= 0 || examTypeId <= 0) {
      throw new ValidationError("Student id and exam type id are required", "student");
    }

    const placement = await loadPlacement(this.ctx, studentId);
    const markStore: MarkStoreEntry[] = parsed.records.map((record) => {
      const marks: Record<string, number> = {};
      record.titles.forEach((title, index) => {
        const value = record.marks[index];
        if (typeof value === "number") marks[title] = value;
      });
      return {
        subjectId: record.subjectId,
        marks,
        learningOutcome: record.learningOutcome ?? null
      };
    });

    const plan = await resolveMarksPlan(
      this.ctx,
      placement,
      parsed.student.category,
      examTypeId,
      markStore
    );
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.assessments.replaceMarksAndResults(scoped, plan.marks, plan.results);

    const ratings = parsed.ratings
      .filter(
        (
          rating
        ): rating is { attribute: string; rate: number; remark: string | null; color: string | null } =>
          rating.attribute !== null && rating.rate !== null
      )
      .map((rating) => ({
        attribute: rating.attribute,
        rate: rating.rate,
        remark: rating.remark,
        color: rating.color
      }));
    await this.writeFeedback(
      placement,
      examTypeId,
      staffId,
      ratings,
      parsed.remark?.remark ?? null,
      {
        daysOpened: parsed.student.daysOpened,
        daysAbsent: parsed.student.daysAbsent,
        daysPresent: parsed.student.daysPresent
      }
    );

    if (
      placement.fullName !== null &&
      parsed.student.fullName.trim().length > 0 &&
      parsed.student.fullName.trim() !== placement.fullName
    ) {
      await this.ctx.repos.profiles.updateStudent(scoped, studentId, {
        fullName: parsed.student.fullName.trim()
      });
    }

    await this.ctx.repos.profiles.createTimelineIfNotExist(scoped, {
      staffStudentId: studentId,
      title: "Marksheet committed",
      description: `Marksheet for ${parsed.student.fullName} committed`,
      type: `exam-${examTypeId}`,
      visibleToStudent: 0,
      activeStatus: 1,
      createdBy: staffId,
      updatedBy: staffId,
      schoolId: placement.schoolId,
      date: new Date().toISOString().slice(0, 10)
    });

    return { ...parsed, recordId: placement.recordId };
  }
}
