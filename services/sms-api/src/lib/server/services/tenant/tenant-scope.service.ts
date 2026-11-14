import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { TenantMismatchError } from "../errors";

/**
 * Validates the request scope before any handler runs. The tenant header
 * values are self-describing; this service proves they belong to the
 * authenticated user's school and academic year.
 */
export class TenantScopeService {
  constructor(private readonly ctx: ServiceContext) {}

  async assertScope(): Promise<void> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const academicId = scoped.tenant.academicId;
    if (academicId === null) return;

    const academicYear = await this.ctx.repos.school.selectAcademicYearById(
      scoped,
      academicId
    );
    if (academicYear === null) {
      throw new TenantMismatchError("The academic year does not belong to this school");
    }

    const { classId, sectionId } = scoped.tenant;
    if (classId === null || sectionId === null) return;

    const classSection = await this.ctx.repos.academics.findClassSectionById(
      scoped,
      classId,
      sectionId
    );
    if (classSection === null) {
      throw new TenantMismatchError(
        "The class or section does not belong to this school"
      );
    }
  }
}
