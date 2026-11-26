import { error } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";
import { loadPeoplePage } from "./people-load";
import {
  createStaffAction,
  deactivateStaffAction,
  updateParentContactAction,
  updateStaffAction,
} from "./people-actions";
import {
  assignTeacherAction,
  createOfferingsAction,
  deactivateAssignmentAction,
  resolveConflictAction,
  selfAssignAction,
  setSelfAssignEnabledAction,
} from "./people-assignment-actions";
import { actionFailure } from "./people-action-context";
import {
  createStudentAction,
  setStudentActiveAction,
  updateStudentAction,
} from "./people-student-actions";

export const load: PageServerLoad = async ({ locals, url }) => {
  if (!locals.user) {
    throw error(401, "Sign in to view people");
  }

  return await loadPeoplePage({ user: locals.user, url });
};

export const actions: Actions = {
  createStaff: async ({ request, locals }) => {
    const result = await createStaffAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true, password: result.password };
  },
  updateStaff: async ({ request, locals }) => {
    const result = await updateStaffAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  deactivateStaff: async ({ request, locals }) => {
    const result = await deactivateStaffAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  createStudent: async ({ request, locals }) => {
    const result = await createStudentAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return {
      success: true,
      studentId: result.studentId,
      studentPassword: result.studentPassword,
      parentPassword: result.parentPassword,
    };
  },
  updateStudent: async ({ request, locals }) => {
    const result = await updateStudentAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  setStudentActive: async ({ request, locals }) => {
    const result = await setStudentActiveAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  updateParentContact: async ({ request, locals }) => {
    const result = await updateParentContactAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  setSelfAssignEnabled: async ({ request, locals }) => {
    const result = await setSelfAssignEnabledAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  createOfferings: async ({ request, locals }) => {
    const result = await createOfferingsAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return {
      success: true,
      created: result.created ?? 0,
      reactivated: result.reactivated ?? 0,
      skipped: result.skipped ?? 0,
    };
  },
  assignTeacher: async ({ request, locals }) => {
    const result = await assignTeacherAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true, updated: result.updated ?? 0, skipped: result.skipped ?? 0 };
  },
  resolveConflict: async ({ request, locals }) => {
    const result = await resolveConflictAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true, deactivated: result.deactivated ?? 0 };
  },
  deactivateAssignment: async ({ request, locals }) => {
    const result = await deactivateAssignmentAction(locals.user, await request.formData());
    if (!result.ok) return actionFailure(result);
    return { success: true };
  },
  selfAssign: async ({ request, locals, cookies }) => {
    const form = await request.formData();
    const result = await selfAssignAction(locals.user, form);
    if (!result.ok) return actionFailure(result);

    const classId = Number(form.get("classId"));
    const sectionId = Number(form.get("sectionId"));
    const className = typeof form.get("className") === "string" ? String(form.get("className")) : null;
    const sectionName =
      typeof form.get("sectionName") === "string" ? String(form.get("sectionName")) : null;
    const academicId = Number(form.get("academicId"));

    if (Number.isInteger(classId) && Number.isInteger(sectionId) && Number.isInteger(academicId)) {
      cookies.set("selected-class", JSON.stringify({
        classId,
        sectionId,
        academicId,
        className,
        sectionName,
      }), {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return { success: true };
  },
};
