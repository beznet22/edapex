import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { SessionReadOnlyError, TenantMismatchError, ValidationError } from "../errors";

/**
 * The §6.1 rule, enforced at the service layer: an archived, restoring or
 * restored session never accepts live-data writes. Report-card corrections
 * write archive versions instead and deliberately do not call this guard.
 */
export async function assertSessionWritable(ctx: ServiceContext): Promise<void> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const academicId = scoped.tenant.academicId;
  if (academicId === null) {
    throw new ValidationError("A session is required for this write", "academicId");
  }
  const year = await ctx.repos.school.selectAcademicYearById(scoped, academicId);
  if (year === null) {
    throw new TenantMismatchError("The academic year does not belong to this school");
  }
  if (
    year.status === "archived" ||
    year.status === "restoring" ||
    year.status === "archived_readable"
  ) {
    throw new SessionReadOnlyError(`The ${year.status} session is read-only`);
  }
}
