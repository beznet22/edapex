import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { PermissionError } from "../errors";

/**
 * The classes a caller may open a roster for.
 *
 * Two audiences, one endpoint. An admin spans the school, so they get every section; a teacher
 * gets only the sections they are assigned to, which is the same set `TenantScopeService`
 * enforces on every class-scoped route. Offering the full list to a teacher would produce a
 * picker whose every other option 403s.
 *
 * Without this, a client had no way to learn a valid `X-Class-Id` — the only route was
 * enumeration, which is precisely the behaviour the scope check exists to prevent.
 */
export interface ClassSectionView {
  readonly classId: number;
  readonly className: string | null;
  readonly sectionId: number;
  readonly sectionName: string | null;
  readonly label: string;
}

export class MyClassesService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(user: { readonly isAdmin: boolean; readonly staffId: number | null }): Promise<
    readonly ClassSectionView[]
  > {
    const scoped = requireScopedContext(this.ctx.repos.ctx);

    if (user.isAdmin) {
      const rows = await this.ctx.repos.academics.listClassSections(scoped);
      return rows
        .filter(
          (row): row is typeof row & { classId: number; sectionId: number } =>
            row.classId !== null && row.sectionId !== null
        )
        .map(toView);
    }

    if (user.staffId === null) {
      // A parent or a student has no class to pick. An empty list is the honest answer; a 403
      // would be indistinguishable from a broken session.
      throw new PermissionError("Class lists are available to staff accounts");
    }

    const assigned = await this.ctx.repos.academics.listAssignedClassSections(
      scoped,
      user.staffId
    );
    return assigned
      .filter(
        (row): row is typeof row & { classId: number; sectionId: number } =>
          row.classId !== null && row.sectionId !== null
      )
      .map(toView);
  }
}

const toView = (row: {
  readonly classId: number;
  readonly className: string | null;
  readonly sectionId: number;
  readonly sectionName: string | null;
}): ClassSectionView => ({
  classId: row.classId,
  className: row.className,
  sectionId: row.sectionId,
  sectionName: row.sectionName,
  label: [row.className, row.sectionName].filter((part) => part !== null).join(" · ")
});
