import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";

export interface MappingData {
  readonly examSetups: Awaited<
    ReturnType<ServiceContext["repos"]["assessments"]["findExamSetupsByClassSection"]>
  >;
  readonly examTypes: Awaited<
    ReturnType<ServiceContext["repos"]["assessments"]["listExamTypes"]>
  >;
  readonly studentCategories: Awaited<
    ReturnType<ServiceContext["repos"]["reference"]["listStudentCategories"]>
  >;
  readonly subjects: Awaited<
    ReturnType<ServiceContext["repos"]["academics"]["listSubjectsByClass"]>
  >;
  readonly classSection: Awaited<
    ReturnType<ServiceContext["repos"]["academics"]["findAssignedClassSection"]>
  >;
  readonly studentData: Readonly<Record<string, never>>;
}

export class AssessmentRosterQueryService {
  constructor(private readonly ctx: ServiceContext) {}

  async getMappingData(classId: number, sectionId: number): Promise<MappingData> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const examTypes = await this.ctx.repos.assessments.listExamTypes(scoped);
    const studentCategories = await this.ctx.repos.reference.listStudentCategories(scoped);
    const subjects = await this.ctx.repos.academics.listSubjectsByClass(
      scoped,
      classId,
      sectionId
    );
    const classSection = await this.ctx.repos.academics.findAssignedClassSection(scoped, {
      classId,
      sectionId
    });
    const examSetups = await this.ctx.repos.assessments.findExamSetupsByClassSection(
      scoped,
      classId,
      sectionId
    );
    return {
      examSetups,
      examTypes,
      studentCategories,
      subjects,
      classSection,
      studentData: {}
    };
  }
}
