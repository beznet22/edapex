import { and, eq } from "drizzle-orm";

import {
  infixRoles,
  smBaseGroups,
  smBaseSetups,
  smClasses,
  smDesignations,
  smHumanDepartments,
  smSections,
  smStudentCategories
} from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import { requireAcademicId } from "../base/repository-context";
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

export interface GuardianRelationOption {
  readonly value: string;
  readonly label: string;
}

export interface StudentRegistrationOptions {
  readonly classes: readonly RegistrationOption[];
  readonly sections: readonly RegistrationOption[];
  readonly categories: readonly RegistrationOption[];
  readonly genders: readonly RegistrationOption[];
  readonly guardianRelations: readonly GuardianRelationOption[];
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

/** Student form dictionaries; the student aggregate plus reference reads. */
export async function findStudentRegistrationOptions(
  ctx: ScopedRepositoryContext
): Promise<StudentRegistrationOptions> {
  return withErrorHandling(async () => {
    const schoolId = ctx.tenant.schoolId;
    const academicId = requireAcademicId(ctx);
    const [classes, sections, categories, genders] = await ctx.db.batch([
      ctx.db
        .select({ id: smClasses.id, name: smClasses.className })
        .from(smClasses)
        .where(
          and(
            eq(smClasses.activeStatus, 1),
            eq(smClasses.schoolId, schoolId),
            eq(smClasses.academicId, academicId)
          )
        )
        .orderBy(smClasses.id),
      ctx.db
        .select({ id: smSections.id, name: smSections.sectionName })
        .from(smSections)
        .where(
          and(
            eq(smSections.activeStatus, 1),
            eq(smSections.schoolId, schoolId),
            eq(smSections.academicId, academicId)
          )
        )
        .orderBy(smSections.id),
      ctx.db
        .select({ id: smStudentCategories.id, name: smStudentCategories.categoryName })
        .from(smStudentCategories)
        .where(eq(smStudentCategories.schoolId, schoolId))
        .orderBy(smStudentCategories.id),
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

    return {
      classes,
      sections,
      categories,
      genders,
      guardianRelations: [
        { value: "father", label: "Father" },
        { value: "mother", label: "Mother" },
        { value: "other", label: "Other" }
      ]
    };
  }, "findStudentRegistrationOptions");
}
