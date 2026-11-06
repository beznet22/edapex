import { and, eq } from "drizzle-orm";

import {
  infixRoles,
  smBaseGroups,
  smBaseSetups,
  smDesignations,
  smHumanDepartments
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface RegistrationOption {
  readonly id: number;
  readonly name: string | null;
}

export interface StaffRegistrationOptions {
  readonly designations: readonly RegistrationOption[];
  readonly departments: readonly RegistrationOption[];
  readonly roles: readonly RegistrationOption[];
  readonly genders: readonly RegistrationOption[];
}

/**
 * Composition of four reference dictionaries for the staff form. It spans
 * aggregates, so it is a read-only query module rather than a repository.
 */
export async function findStaffRegistrationOptions(
  ctx: ScopedRepositoryContext
): Promise<StaffRegistrationOptions> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const [designations, departments, roles, genders] = await ctx.db.batch([
      ctx.db
        .select({ id: smDesignations.id, name: smDesignations.title })
        .from(smDesignations)
        .where(and(eq(smDesignations.activeStatus, 1), eq(smDesignations.schoolId, schoolId)))
        .orderBy(smDesignations.id),
      ctx.db
        .select({ id: smHumanDepartments.id, name: smHumanDepartments.name })
        .from(smHumanDepartments)
        .where(
          and(
            eq(smHumanDepartments.activeStatus, 1),
            eq(smHumanDepartments.schoolId, schoolId)
          )
        )
        .orderBy(smHumanDepartments.id),
      ctx.db
        .select({ id: infixRoles.id, name: infixRoles.name })
        .from(infixRoles)
        .where(and(eq(infixRoles.activeStatus, 1), eq(infixRoles.schoolId, schoolId)))
        .orderBy(infixRoles.id),
      ctx.db
        .select({ id: smBaseSetups.id, name: smBaseSetups.baseSetupName })
        .from(smBaseSetups)
        .innerJoin(smBaseGroups, eq(smBaseSetups.baseGroupId, smBaseGroups.id))
        .where(
          and(
            eq(smBaseGroups.name, "Gender"),
            eq(smBaseGroups.schoolId, schoolId),
            eq(smBaseSetups.schoolId, schoolId),
            eq(smBaseSetups.activeStatus, 1)
          )
        )
        .orderBy(smBaseSetups.id)
    ]);
    return { designations, departments, roles, genders };
  }, "findStaffRegistrationOptions");
}
