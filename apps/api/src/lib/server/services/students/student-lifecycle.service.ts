import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ValidationError } from "../errors";

export interface PromoteStudentInput {
  readonly studentId: number;
  readonly classId: number;
  readonly sectionId: number;
  readonly targetAcademicId?: number;
  readonly rollNo?: number;
  readonly resultStatus?: string;
}

export interface PromoteStudentResult {
  readonly studentId: number;
  readonly promotionId: number;
  readonly recordId: number;
  readonly rollNo: number | null;
  readonly feesAssigned: number;
  readonly chatGroupsMoved: boolean;
}

export interface DemoteStudentInput {
  readonly studentId: number;
  readonly promotionId?: number;
}

export interface DemoteStudentResult {
  readonly studentId: number;
  readonly promotionId: number;
  readonly previousClassId: number;
  readonly previousSectionId: number;
  readonly previousAcademicId: number;
}

export interface StudentStatusView {
  readonly studentId: number;
  readonly fullName: string | null;
  readonly active: boolean;
}

export class StudentLifecycleService {
  constructor(private readonly ctx: ServiceContext) {}

  async promoteStudent(
    input: PromoteStudentInput,
    staffId: number
  ): Promise<PromoteStudentResult> {
    if (input.studentId <= 0 || input.classId <= 0 || input.sectionId <= 0) {
      throw new ValidationError("Student, class and section are required", "studentId");
    }
    if (!Number.isInteger(staffId) || staffId <= 0) {
      throw new ValidationError("A positive staff id is required", "staffId");
    }

    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const details = await this.ctx.repos.queries.findStudentDetails(
      scoped,
      input.studentId
    );
    if (details === null || details.academicId === null) {
      throw new ValidationError("Student has no current placement", "studentId");
    }

    const targetAcademicId = input.targetAcademicId ?? details.academicId;
    if (targetAcademicId <= 0) {
      throw new ValidationError("A positive target academic year is required", "targetAcademicId");
    }

    const promotion = await this.ctx.repos.profiles.promoteStudent(scoped, {
      studentId: input.studentId,
      classId: input.classId,
      sectionId: input.sectionId,
      targetAcademicId,
      ...(input.rollNo === undefined ? {} : { rollNo: input.rollNo }),
      ...(input.resultStatus === undefined ? {} : { resultStatus: input.resultStatus })
    });

    const masters = await this.ctx.repos.fees.listFeeMastersByClass(
      scoped,
      input.classId,
      targetAcademicId
    );
    const hasChatScope =
      details.userId !== null &&
      details.classId !== null &&
      details.sectionId !== null;
    const oldGroups = hasChatScope
      ? await this.ctx.repos.communications.listChatGroupsByClass(
          scoped,
          details.classId ?? 0,
          details.sectionId ?? 0,
          details.academicId
        )
      : [];
    const newGroups = hasChatScope
      ? await this.ctx.repos.communications.listChatGroupsByClass(
          scoped,
          input.classId,
          input.sectionId,
          targetAcademicId
        )
      : [];

    try {
      const feesAssigned = await this.ctx.repos.fees.assignFeesToStudent(scoped, {
        studentId: input.studentId,
        recordId: promotion.recordId,
        classId: input.classId,
        sectionId: input.sectionId,
        academicId: targetAcademicId,
        masters,
        createdBy: staffId
      });

      if (hasChatScope && details.userId !== null) {
        await this.ctx.repos.communications.replaceUserGroups(scoped, {
          userId: details.userId,
          fromGroupIds: oldGroups,
          toGroupIds: newGroups,
          addedBy: staffId,
          role: 1
        });
      }

      return {
        studentId: input.studentId,
        promotionId: promotion.promotionId,
        recordId: promotion.recordId,
        rollNo: promotion.rollNo,
        feesAssigned,
        chatGroupsMoved: hasChatScope
      };
    } catch (error) {
      try {
        await this.ctx.repos.fees.deleteFeeAssignmentsForRecord(scoped, promotion.recordId);
      } catch {
        // Compensation is best-effort; the original failure is rethrown.
      }
      if (hasChatScope && details.userId !== null) {
        try {
          await this.ctx.repos.communications.replaceUserGroups(scoped, {
            userId: details.userId,
            fromGroupIds: newGroups,
            toGroupIds: oldGroups,
            addedBy: staffId,
            role: 1
          });
        } catch {
          // Keep the original failure visible.
        }
      }
      try {
        await this.ctx.repos.profiles.demoteStudent(scoped, {
          studentId: input.studentId,
          promotionId: promotion.promotionId,
          currentClassId: input.classId,
          currentSectionId: input.sectionId,
          currentAcademicId: targetAcademicId,
          previousClassId: details.classId ?? 0,
          previousSectionId: details.sectionId ?? 0,
          previousAcademicId: details.academicId,
          previousRollNumber: details.rollNo
        });
      } catch {
        // Keep the original failure visible.
      }
      throw error;
    }
  }

  async demoteStudent(input: DemoteStudentInput): Promise<DemoteStudentResult> {
    if (input.studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const details = await this.ctx.repos.queries.findStudentDetails(
      scoped,
      input.studentId
    );
    if (details === null) {
      throw new ValidationError("Student not found", "studentId");
    }
    const promotion = await this.ctx.repos.profiles.findLatestPromotion(
      scoped,
      input.studentId
    );
    if (promotion === null) {
      throw new ValidationError("No promotion exists for this student", "studentId");
    }
    if (input.promotionId !== undefined && input.promotionId !== promotion.id) {
      throw new ValidationError("Only the latest promotion can be reverted", "promotionId");
    }

    const currentClassId = promotion.currentClassId ?? 0;
    const currentSectionId = promotion.currentSectionId ?? 0;
    const currentAcademicId = promotion.currentSessionId ?? 0;
    const previousClassId = promotion.previousClassId ?? 0;
    const previousSectionId = promotion.previousSectionId ?? 0;
    const previousAcademicId = promotion.previousSessionId ?? 0;
    if (
      currentClassId <= 0 ||
      currentSectionId <= 0 ||
      currentAcademicId <= 0 ||
      previousClassId <= 0 ||
      previousSectionId <= 0 ||
      previousAcademicId <= 0
    ) {
      throw new ValidationError("The promotion is missing placement ids", "promotionId");
    }

    if (details.studentRecordId !== null) {
      await this.ctx.repos.fees.deleteFeeAssignmentsForRecord(
        scoped,
        details.studentRecordId
      );
    }

    if (details.userId !== null) {
      const currentGroups = await this.ctx.repos.communications.listChatGroupsByClass(
        scoped,
        currentClassId,
        currentSectionId,
        currentAcademicId
      );
      const previousGroups = await this.ctx.repos.communications.listChatGroupsByClass(
        scoped,
        previousClassId,
        previousSectionId,
        previousAcademicId
      );
      await this.ctx.repos.communications.replaceUserGroups(scoped, {
        userId: details.userId,
        fromGroupIds: currentGroups,
        toGroupIds: previousGroups,
        addedBy: details.userId,
        role: 1
      });
    }

    await this.ctx.repos.profiles.demoteStudent(scoped, {
      studentId: input.studentId,
      promotionId: promotion.id,
      currentClassId,
      currentSectionId,
      currentAcademicId,
      previousClassId,
      previousSectionId,
      previousAcademicId,
      previousRollNumber: promotion.previousRollNumber ?? null
    });

    return {
      studentId: input.studentId,
      promotionId: promotion.id,
      previousClassId,
      previousSectionId,
      previousAcademicId
    };
  }

  async setActiveStatus(studentId: number, active: boolean): Promise<StudentStatusView> {
    if (!Number.isInteger(studentId) || studentId <= 0) {
      throw new ValidationError("A positive student id is required", "studentId");
    }
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const result = await this.ctx.repos.profiles.updateStudentStatus(
      scoped,
      studentId,
      active
    );
    return {
      studentId: result.studentId,
      fullName: result.fullName,
      active: result.active
    };
  }
}
