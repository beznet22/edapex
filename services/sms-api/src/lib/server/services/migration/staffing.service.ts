import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseOrThrow } from "../validation";
import { staffingBodySchema } from "./staffing-input";

type StaffingSection = Awaited<
  ReturnType<ServiceContext["repos"]["queries"]["listStaffingSections"]>
>[number];

export interface StaffingListView {
  readonly sessionId: number;
  readonly sections: readonly StaffingSection[];
}

export interface StaffingAcceptView {
  readonly sessionId: number;
  readonly reviewed: number;
  readonly needsStaffing: readonly {
    readonly classId: number;
    readonly sectionId: number;
    readonly className: string;
    readonly sectionName: string;
  }[];
}

const READ_ONLY = ["archived", "restoring", "archived_readable"] as const;

const isReadOnly = (status: string): boolean =>
  READ_ONLY.some((value) => value === status);

export class StaffingService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(sessionId: number): Promise<StaffingListView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const sections = await this.ctx.repos.queries.listStaffingSections(scoped, sessionId);
    return { sessionId, sections };
  }

  async replace(
    sessionId: number,
    classId: number,
    sectionId: number,
    input: unknown,
    actorId: number
  ): Promise<StaffingSection> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => staffingBodySchema.parseAsync(input),
      "Staffing validation failed"
    );
    const year = await this.ctx.repos.school.selectAcademicYearById(scoped, sessionId);
    if (year === null) throw new NotFoundError("Academic year", sessionId);
    if (isReadOnly(year.status)) {
      throw new ConflictError("A closed or restored session cannot be staffed");
    }
    const target = await this.ctx.repos.academics.findTargetSection(
      scoped,
      sessionId,
      classId,
      sectionId
    );
    if (target === null) throw new NotFoundError("Class-section", `${classId}/${sectionId}`);

    const subjectIds = await this.ctx.repos.academics.subjectIdsForYear(scoped, sessionId);
    const seenSubjects = new Set<number>();
    for (const [index, assignment] of parsed.assignments.entries()) {
      if (!subjectIds.has(assignment.subjectId)) {
        throw new ValidationError(
          "Subject does not belong to this session",
          `assignments.${index}.subjectId`
        );
      }
      if (seenSubjects.has(assignment.subjectId)) {
        throw new ValidationError("Duplicate subject assignment", `assignments.${index}`);
      }
      seenSubjects.add(assignment.subjectId);
    }
    if (parsed.assignments.length === 0 && !parsed.noSubjects) {
      throw new ValidationError(
        "At least one subject assignment is required (or set noSubjects)",
        "assignments"
      );
    }
    const staffIds = [
      ...(parsed.classTeacherId === null ? [] : [parsed.classTeacherId]),
      ...parsed.assignments.map((assignment) => assignment.staffId)
    ];
    for (const staffId of [...new Set(staffIds)]) {
      const copyable = await this.ctx.repos.queries.findCopyableTeacher(scoped, staffId);
      if (!copyable) {
        throw new ValidationError("Staff member is missing or inactive", "staffId");
      }
    }

    const beforeList = await this.ctx.repos.queries.listStaffingSections(scoped, sessionId);
    const before =
      beforeList.find((row) => row.classId === classId && row.sectionId === sectionId) ?? null;

    await this.ctx.repos.academics.replaceAssignments(scoped, {
      academicId: sessionId,
      classId,
      sectionId,
      actorId,
      assignments: parsed.assignments
    });
    await this.ctx.repos.academics.replaceClassTeacher(scoped, {
      academicId: sessionId,
      classId,
      sectionId,
      actorId,
      staffId: parsed.classTeacherId
    });
    await this.ctx.repos.academics.markReviewed(scoped, {
      academicId: sessionId,
      classId,
      sectionId,
      actorId
    });

    await this.ctx.repos.lifecycle.insertResolutions(scoped, [
      {
        schoolId: scoped.tenant.schoolId,
        findingId: "STAFFING_REVIEWED",
        entity: "sm_class_sections",
        entityId: `${sessionId}:${classId}:${sectionId}`,
        beforeJson:
          before === null
            ? null
            : JSON.stringify({
                staffingStatus: before.staffingStatus,
                classTeacherId: before.classTeacher?.staffId ?? null,
                assignments: before.assignments
              }),
        afterJson: JSON.stringify({
          classTeacherId: parsed.classTeacherId,
          assignments: parsed.assignments,
          noSubjects: parsed.noSubjects
        }),
        reason: "STAFFING_REVIEWED",
        archiveKey: null,
        appliedAt: this.ctx.ports.clock.now()
      }
    ]);

    const after = await this.ctx.repos.queries.listStaffingSections(scoped, sessionId);
    const updated = after.find((row) => row.classId === classId && row.sectionId === sectionId);
    if (updated === undefined) throw new NotFoundError("Class-section", `${classId}/${sectionId}`);
    return updated;
  }

  async acceptCopied(sessionId: number, actorId: number): Promise<StaffingAcceptView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const year = await this.ctx.repos.school.selectAcademicYearById(scoped, sessionId);
    if (year === null) throw new NotFoundError("Academic year", sessionId);
    if (isReadOnly(year.status)) {
      throw new ConflictError("A closed or restored session cannot be staffed");
    }
    const sections = await this.ctx.repos.queries.listStaffingSections(scoped, sessionId);
    let reviewed = 0;
    const needsStaffing: {
      classId: number;
      sectionId: number;
      className: string;
      sectionName: string;
    }[] = [];
    for (const section of sections) {
      if (section.staffingStatus !== "copied") continue;
      if (section.assignmentCount === 0) {
        needsStaffing.push({
          classId: section.classId,
          sectionId: section.sectionId,
          className: section.className,
          sectionName: section.sectionName
        });
        continue;
      }
      await this.ctx.repos.academics.markReviewed(scoped, {
        academicId: sessionId,
        classId: section.classId,
        sectionId: section.sectionId,
        actorId
      });
      await this.ctx.repos.lifecycle.insertResolutions(scoped, [
        {
          schoolId: scoped.tenant.schoolId,
          findingId: "STAFFING_REVIEWED",
          entity: "sm_class_sections",
          entityId: `${sessionId}:${section.classId}:${section.sectionId}`,
          beforeJson: JSON.stringify({
            staffingStatus: section.staffingStatus,
            assignments: section.assignments
          }),
          afterJson: JSON.stringify({ acceptedCopied: true }),
          reason: "STAFFING_ACCEPTED_COPIED",
          archiveKey: null,
          appliedAt: this.ctx.ports.clock.now()
        }
      ]);
      reviewed += 1;
    }
    return { sessionId, reviewed, needsStaffing };
  }
}
