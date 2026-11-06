import { AttributeRemark } from "../../../constants/assessment";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";

const ratingRemark = (rate: number): string | null => {
  const entry = Object.entries(AttributeRemark).find(([key]) => Number(key) === rate);
  return entry?.[1] ?? null;
};

export interface TeacherRemarkInput {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly remark: string;
  readonly teacherId: number;
}

export interface StudentRatingsInput {
  readonly studentId: number;
  readonly examTypeId: number;
  readonly ratings: Readonly<Record<string, number | null>>;
}

export class AssessmentFeedbackService {
  constructor(private readonly ctx: ServiceContext) {}

  async upsertTeacherRemark(input: TeacherRemarkInput): Promise<void> {
    if (input.studentId <= 0 || input.examTypeId <= 0) {
      throw new ValidationError("Student id and exam type id are required", "studentId");
    }
    if (!Number.isInteger(input.teacherId) || input.teacherId <= 0) {
      throw new ValidationError("A positive teacher id is required", "teacherId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.assessments.upsertTeacherRemark(scoped, {
      studentId: input.studentId,
      examTypeId: input.examTypeId,
      remark: input.remark,
      teacherId: input.teacherId
    });
  }

  async upsertStudentRatings(input: StudentRatingsInput): Promise<void> {
    if (input.studentId <= 0 || input.examTypeId <= 0) {
      throw new ValidationError("Student id and exam type id are required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const ratings = Object.entries(input.ratings)
      .filter((entry): entry is [string, number] => typeof entry[1] === "number")
      .map(([attribute, rate]) => {
        if (attribute.trim().length === 0) {
          throw new ValidationError("Rating attributes cannot be blank", "ratings");
        }
        if (!Number.isInteger(rate) || rate < 1 || rate > 5) {
          throw new ValidationError("Ratings must be between 1 and 5", `ratings.${attribute}`);
        }
        return {
          studentId: input.studentId,
          examTypeId: input.examTypeId,
          attribute,
          rate,
          remark: ratingRemark(rate),
          color: null,
          schoolId: scoped.tenant.schoolId,
          activeStatus: 1
        };
      });

    if (ratings.length > 0) {
      await this.ctx.repos.assessments.upsertStudentRatings(scoped, ratings);
    }
  }
}
