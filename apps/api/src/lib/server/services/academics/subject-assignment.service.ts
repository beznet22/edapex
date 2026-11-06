import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { TenantScopeError, ValidationError } from "../errors";

export interface SubjectAssignmentItem {
  readonly subjectId: number;
  readonly staffId: number;
}

export interface SubjectAssignmentInput {
  readonly assignments: readonly SubjectAssignmentItem[];
  readonly createdBy: number;
}

export interface SubjectAssignmentResult {
  readonly assigned: number;
}

export class SubjectAssignmentService {
  constructor(private readonly ctx: ServiceContext) {}

  async assign(input: SubjectAssignmentInput): Promise<SubjectAssignmentResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const { classId, sectionId, academicId, schoolId } = scoped.tenant;
    if (classId === null || sectionId === null || academicId === null) {
      throw new TenantScopeError("Class and section are required to assign subjects");
    }
    if (!Number.isInteger(input.createdBy) || input.createdBy <= 0) {
      throw new ValidationError("A positive user id is required", "createdBy");
    }
    if (input.assignments.length === 0) {
      throw new ValidationError("At least one assignment is required", "assignments");
    }

    const seen = new Set<string>();
    for (const [index, item] of input.assignments.entries()) {
      if (!Number.isInteger(item.subjectId) || item.subjectId <= 0) {
        throw new ValidationError(
          "A positive subject id is required",
          `assignments.${index}.subjectId`
        );
      }
      if (!Number.isInteger(item.staffId) || item.staffId <= 0) {
        throw new ValidationError(
          "A positive staff id is required",
          `assignments.${index}.staffId`
        );
      }
      const key = `${item.subjectId}:${item.staffId}`;
      if (seen.has(key)) {
        throw new ValidationError(
          "Duplicate subject assignment",
          `assignments.${index}`
        );
      }
      seen.add(key);
    }

    const subjectIds = [...new Set(input.assignments.map((item) => item.subjectId))];
    for (const subjectId of subjectIds) {
      const subject = await this.ctx.repos.academics.findSubjectById(scoped, subjectId);
      if (subject === null) {
        throw new ValidationError(
          "Subject does not belong to this school",
          "assignments"
        );
      }
    }

    const staffIds = [...new Set(input.assignments.map((item) => item.staffId))];
    for (const staffId of staffIds) {
      const staff = await this.ctx.repos.profiles.findStaffById(scoped, staffId);
      if (staff === null) {
        throw new ValidationError(
          "Staff member does not belong to this school",
          "assignments"
        );
      }
    }

    const rows = input.assignments.map((item) => ({
      teacherId: item.staffId,
      classId,
      sectionId,
      subjectId: item.subjectId,
      schoolId,
      academicId,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      activeStatus: 1
    }));
    await this.ctx.repos.academics.assignSubjects(scoped, rows);
    return { assigned: rows.length };
  }
}
