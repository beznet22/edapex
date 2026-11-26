import { AssignmentRepository, AssignmentConflictError, AssignmentReplaceRequiredError } from "$lib/server/repository/assignment.repo";
import { SettingsService } from "$lib/server/service/settings.service";
import { canSelfAssign, isAdminOrIt } from "$lib/server/people/people-access";
import { parseIdList } from "$lib/server/people/people-params";
import {
  formNumber,
  formString,
  isActiveClass,
  ownsActiveTeacher,
  requireManager,
  resolveAcademicId,
  staffProvider,
  type ActionResult,
} from "./people-action-context";
import type { AuthUser } from "$lib/types/auth-types";

export async function setSelfAssignEnabledAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const enabled = formString(form, "enabled") === "true";
  try {
    await new SettingsService(context.schoolId).setTeacherSelfAssignEnabled(enabled);
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Could not update the self-assignment setting" };
  }
}

export async function createOfferingsAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult & { created?: number; reactivated?: number; skipped?: number }> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const classId = formNumber(form, "classId");
  const sectionId = formNumber(form, "sectionId");
  if (classId <= 0 || sectionId <= 0) {
    return { ok: false, status: 400, error: "Select a class and section" };
  }

  const subjectIds = parseIdList(formString(form, "subjectIds"));
  if (subjectIds.length === 0) {
    return { ok: false, status: 400, error: "Select at least one subject" };
  }

  const academicId = await resolveAcademicId(context.provider);
  if (academicId === null) {
    return { ok: false, status: 400, error: "No active academic year" };
  }
  if (!(await isActiveClass(context.provider, context.schoolId, academicId, classId, sectionId))) {
    return { ok: false, status: 400, error: "That class is not active this year" };
  }

  try {
    const result = await context.provider.getRepo(AssignmentRepository).createOfferings({
      schoolId: context.schoolId,
      academicId,
      classId,
      sectionId,
      subjectIds,
      actorId: context.user.id,
    });
    return {
      ok: true,
      created: result.created,
      reactivated: result.reactivated,
      skipped: result.skipped,
    };
  } catch {
    return { ok: false, status: 500, error: "Could not create the class subjects" };
  }
}

export async function assignTeacherAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult & { updated?: number; skipped?: number }> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const teacherId = formNumber(form, "teacherId");
  if (teacherId <= 0) return { ok: false, status: 400, error: "Select a teacher" };
  if (!(await ownsActiveTeacher(context.schoolId, teacherId))) {
    return { ok: false, status: 400, error: "That teacher is not active in your school" };
  }

  const offeringIds = parseIdList(formString(form, "offeringIds"));
  if (offeringIds.length === 0) {
    return { ok: false, status: 400, error: "Select at least one class subject" };
  }

  const academicId = await resolveAcademicId(context.provider);
  if (academicId === null) {
    return { ok: false, status: 400, error: "No active academic year" };
  }

  const replace = formString(form, "replace") === "true";
  try {
    const result = await context.provider.getRepo(AssignmentRepository).assignOfferingTeacher({
      schoolId: context.schoolId,
      academicId,
      offeringIds,
      teacherId,
      replace,
      actorId: context.user.id,
    });
    return { ok: true, updated: result.updated, skipped: result.skipped };
  } catch (error) {
    if (error instanceof AssignmentReplaceRequiredError) {
      return {
        ok: false,
        status: 409,
        error: "One of these subjects already has a different teacher. Confirm the replacement.",
      };
    }
    if (error instanceof AssignmentConflictError) {
      return {
        ok: false,
        status: 400,
        error: "Duplicate active rows exist for one of these subjects. Resolve the conflict first.",
      };
    }
    return { ok: false, status: 500, error: "Could not assign the teacher" };
  }
}

export async function resolveConflictAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult & { deactivated?: number }> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const classId = formNumber(form, "classId");
  const sectionId = formNumber(form, "sectionId");
  const subjectId = formNumber(form, "subjectId");
  const keepRowId = formNumber(form, "keepRowId");
  if (classId <= 0 || sectionId <= 0 || subjectId <= 0 || keepRowId <= 0) {
    return { ok: false, status: 400, error: "Select the row to keep" };
  }

  const academicId = await resolveAcademicId(context.provider);
  if (academicId === null) {
    return { ok: false, status: 400, error: "No active academic year" };
  }

  try {
    const result = await context.provider.getRepo(AssignmentRepository).resolveConflict({
      schoolId: context.schoolId,
      academicId,
      classId,
      sectionId,
      subjectId,
      keepRowId,
      actorId: context.user.id,
    });
    return { ok: true, deactivated: result.deactivated };
  } catch {
    return { ok: false, status: 500, error: "Could not resolve the conflict" };
  }
}

export async function deactivateAssignmentAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const offeringId = formNumber(form, "offeringId");
  if (offeringId <= 0) return { ok: false, status: 400, error: "Select an assignment" };

  const academicId = await resolveAcademicId(context.provider);
  if (academicId === null) {
    return { ok: false, status: 400, error: "No active academic year" };
  }

  try {
    const result = await context.provider.getRepo(AssignmentRepository).deactivateAssignment({
      offeringId,
      schoolId: context.schoolId,
      academicId,
      actorId: context.user.id,
    });
    if (!result.deactivated) {
      return { ok: false, status: 400, error: "That assignment is no longer active" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Could not remove the assignment" };
  }
}

export async function selfAssignAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult & { assigned?: number }> {
  if (!user || !user.staffId) {
    return { ok: false, status: 403, error: "Not permitted" };
  }

  const schoolId = user.schoolId ?? 1;
  const provider = await staffProvider(user, schoolId);
  const academicId = await resolveAcademicId(provider);
  if (academicId === null) {
    return { ok: false, status: 400, error: "No active academic year" };
  }

  const enabled = await new SettingsService(schoolId).getTeacherSelfAssignEnabled();
  const eligibility = await provider
    .getRepo(AssignmentRepository)
    .getEligibility({ staffId: user.staffId, schoolId, academicId });

  if (
    !canSelfAssign({
      enabled,
      isAdminOrIt: isAdminOrIt(user),
      staffId: user.staffId,
      activeAssignments: eligibility.activeAssignments,
      staffActive: user.activeStatus !== 0,
    })
  ) {
    return {
      ok: false,
      status: 403,
      error: enabled
        ? "Self-assignment is only available to staff with no active assignments"
        : "Self-assignment is disabled. Ask an administrator to assign you.",
    };
  }

  const classId = formNumber(form, "classId");
  const sectionId = formNumber(form, "sectionId");
  if (classId <= 0 || sectionId <= 0) {
    return { ok: false, status: 400, error: "Select a class and section" };
  }
  if (!(await isActiveClass(provider, schoolId, academicId, classId, sectionId))) {
    return { ok: false, status: 400, error: "That class is not active this year" };
  }

  const subjectIds = parseIdList(formString(form, "subjectIds"));
  if (subjectIds.length === 0) {
    return { ok: false, status: 400, error: "Select at least one subject" };
  }

  try {
    const result = await provider.getRepo(AssignmentRepository).selfAssign({
      schoolId,
      academicId,
      staffId: user.staffId,
      classId,
      sectionId,
      subjectIds,
      actorId: user.id,
    });
    return { ok: true, assigned: result.assigned };
  } catch (error) {
    if (error instanceof AssignmentConflictError) {
      return {
        ok: false,
        status: 409,
        error: "A subject here is already assigned. Ask an administrator to resolve the conflict.",
      };
    }
    return { ok: false, status: 500, error: "Could not complete the self-assignment" };
  }
}
