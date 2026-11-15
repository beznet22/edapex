import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError, ValidationError } from "../errors";
import type { StudentPatch } from "../../repository/profiles/student/types";

/**
 * Reading and editing an existing student.
 *
 * # Placement is not here
 *
 * `StudentPatch` carries `classId`/`sectionId`, but this service never writes them. Moving a
 * student between sections is a *promotion*: `StudentLifecycleService.promoteStudent`
 * orchestrates a new `student_records` row, fee assignment and chat-group migration. A
 * plain column update would change the denormalized mirror and leave the record, the fees
 * and the groups pointing at the old placement — the class of bug that surfaces a term later
 * as "the marks went to the wrong class".
 *
 * # Retire, not delete
 *
 * `deleteStudent` is a hard `DELETE`. Marks, attendance, fees and archived report cards all
 * reference the id, so removal sets `active_status = 0` through `updateStudentStatus`, which
 * already updates the student *and* every placement record in one batch.
 */
export interface StudentDetailView {
  readonly studentId: number;
  readonly admissionNo: number | null;
  readonly fullName: string | null;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly email: string | null;
  readonly mobile: string | null;
  readonly studentPhoto: string | null;
  readonly dateOfBirth: string | null;
  readonly genderId: number | null;
  readonly studentCategoryId: number | null;
  readonly classId: number | null;
  readonly sectionId: number | null;
  readonly className: string | null;
  readonly sectionName: string | null;
  readonly active: boolean | null;
  readonly guardian: {
    readonly parentId: number;
    readonly name: string | null;
    readonly email: string | null;
    readonly mobile: string | null;
  } | null;
}

export class StudentProfileService {
  constructor(private readonly ctx: ServiceContext) {}

  async get(studentId: number): Promise<StudentDetailView> {
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const details = await this.ctx.repos.queries.findStudentDetails(scoped, studentId);
    if (details === null) throw new NotFoundError("Student", studentId);

    return {
      studentId: details.studentId,
      admissionNo: details.admissionNo,
      fullName: details.fullName,
      firstName: details.firstName,
      lastName: details.lastName,
      email: details.email,
      mobile: details.mobile,
      studentPhoto: details.studentPhoto,
      dateOfBirth: details.dateOfBirth,
      genderId: details.genderId,
      studentCategoryId: details.studentCategoryId,
      classId: details.classId,
      sectionId: details.sectionId,
      className: details.className,
      sectionName: details.sectionName,
      active: details.activeStatus === 1,
      guardian:
        details.parentId === null
          ? null
          : {
              parentId: details.parentId,
              name: details.guardiansName,
              email: details.guardiansEmail,
              mobile: details.guardiansMobile
            }
    };
  }

  async update(studentId: number, patch: StudentPatch): Promise<StudentDetailView> {
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    /*
     * Placement arrives in `StudentPatch` because promotion needs it. Stripping it here —
     * rather than trusting the caller — is what makes "PATCH cannot move a student" a fact
     * instead of a convention.
     */
    const { classId: _classId, sectionId: _sectionId, ...editable } = patch;
    if (Object.keys(editable).length === 0) {
      throw new ValidationError("No editable fields were provided", "patch");
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const updated = await this.ctx.repos.profiles.updateStudent(scoped, studentId, editable);
    if (updated === null) throw new NotFoundError("Student", studentId);

    return await this.get(studentId);
  }

  /** What the UI calls "Remove". Never a hard delete. */
  async setActive(studentId: number, active: boolean): Promise<StudentDetailView> {
    await this.get(studentId);
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    await this.ctx.repos.profiles.updateStudentStatus(scoped, studentId, active);
    return await this.get(studentId);
  }
}
