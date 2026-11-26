import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStaffs } from "$lib/server/db/sms-schema";
import { ParentRepository } from "$lib/server/repository/parent.repo";
import { StaffRepository } from "$lib/server/repository/staff.repo";
import { validateParentContact, validateStaffInput } from "$lib/server/people/people-format";
import {
  formNumber,
  formString,
  ownsStaffRow,
  requireManager,
  type ActionFailure,
  type ActionResult,
} from "./people-action-context";

import type { AuthUser } from "$lib/types/auth-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePartialIdentity(fields: {
  firstName: string;
  lastName: string;
  email: string;
}): string | null {
  const firstName = fields.firstName.trim();
  const lastName = fields.lastName.trim();
  const email = fields.email.trim().toLowerCase();

  if (firstName && firstName.length > 100) return "First name is too long";
  if (lastName && lastName.length > 100) return "Last name is too long";
  if (email) {
    if (email.length > 50) return "Email must be 50 characters or fewer";
    if (!EMAIL_RE.test(email)) return "Enter a valid email address";
  }
  if (!firstName && !lastName && !email) return "Change at least one field";
  return null;
}

function mapError(error: unknown): ActionResult {
  const message = error instanceof Error ? error.message : "";
  if (message === "USER_EXISTS") {
    return { ok: false, status: 400, error: "A login with that email already exists" };
  }
  if (message === "STAFF_NOT_FOUND") {
    return { ok: false, status: 400, error: "That staff member no longer exists" };
  }
  if (message === "USER_NOT_FOUND") {
    return { ok: false, status: 400, error: "That staff member has no login to update" };
  }
  return { ok: false, status: 500, error: "Could not save the staff change" };
}

export async function createStaffAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult & { password?: string }> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const input = validateStaffInput({
    firstName: formString(form, "firstName"),
    lastName: formString(form, "lastName"),
    email: formString(form, "email"),
    mobile: formString(form, "mobile"),
    designationId: formNumber(form, "designationId"),
    departmentId: formNumber(form, "departmentId"),
    roleId: formNumber(form, "roleId"),
    genderId: formNumber(form, "genderId"),
    qualification: formString(form, "qualification") || undefined,
    experience: formString(form, "experience") || undefined,
  });
  if (!input.ok) return { ok: false, status: 400, error: input.error };

  try {
    const created = await context.provider.getRepo(StaffRepository).createStaff({
      ...input.value,
      mobile: input.value.mobile ?? "",
      schoolId: context.schoolId,
    });
    return { ok: true, password: created.password };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateStaffAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const staffId = formNumber(form, "staffId");
  if (staffId <= 0) return { ok: false, status: 400, error: "Select a staff member" };
  if (!(await ownsStaffRow(context.schoolId, staffId))) {
    return { ok: false, status: 400, error: "That staff member is not in your school" };
  }

  const firstName = formString(form, "firstName");
  const lastName = formString(form, "lastName");
  const email = formString(form, "email");
  const invalid = validatePartialIdentity({ firstName, lastName, email });
  if (invalid) return { ok: false, status: 400, error: invalid };

  try {
    await context.provider.getRepo(StaffRepository).updateStaff({
      staffId,
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      email: email.trim().toLowerCase() || undefined,
      mobile: formString(form, "mobile").trim() || undefined,
      qualification: formString(form, "qualification").trim() || undefined,
      experience: formString(form, "experience").trim() || undefined,
    });
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function deactivateStaffAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const staffId = formNumber(form, "staffId");
  if (staffId <= 0) return { ok: false, status: 400, error: "Select a staff member" };
  if (!(await ownsStaffRow(context.schoolId, staffId))) {
    return { ok: false, status: 400, error: "That staff member is not in your school" };
  }

  try {
    await context.provider.getRepo(StaffRepository).updateStaffStatus({ teacherId: staffId, active: false });
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateParentContactAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const parentId = formNumber(form, "parentId");
  if (parentId <= 0) return { ok: false, status: 400, error: "Select a parent" };

  const validation = validateParentContact({
    guardianEmail: formString(form, "guardianEmail"),
    guardianMobile: formString(form, "guardianMobile"),
  });
  if (!validation.ok) return { ok: false, status: 400, error: validation.error };

  try {
    const result = await context.provider.getRepo(ParentRepository).updateContact({
      parentId,
      schoolId: context.schoolId,
      guardianEmail: validation.value.guardianEmail,
      guardianMobile: validation.value.guardianMobile,
    });
    if (result.updated === 0) {
      return { ok: false, status: 400, error: "That parent is not in your school" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Could not update the parent contact" };
  }
}

