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

  /**
   * @param isAdmin Taken from the authenticated identity rather than read again here:
   * `AuthorizationService` needs an unscoped context, and a tenant request has a scoped
   * one. The middleware already holds the flag, so asking for it costs nothing and keeps
   * this service free of a second context construction.
   */
  async assertScope(isAdmin = false): Promise<void> {
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

    const { classId, sectionId, staffId } = scoped.tenant;
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

    /*
     * The check above proves the *school* owns the section. It does not prove the caller
     * may act on it, and until this block existed any teacher could read any section by
     * setting `X-Class-Id` — the header is self-describing, so it proves nothing.
     *
     * Admins legitimately span the school. Everyone else without a staff row (a parent, a
     * student) has no assignments to check against and is bounded by the routes they can
     * reach instead.
     */
    if (isAdmin || staffId === null) return;

    const assigned = await this.ctx.repos.academics.listAssignedClassSections(
      scoped,
      staffId
    );
    const teaches = assigned.some(
      (row) => row.classId === classId && row.sectionId === sectionId
    );
    if (!teaches) {
      throw new TenantMismatchError("This class or section is not assigned to you");
    }
  }
}
