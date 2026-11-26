import type { ConflictGroup, ConflictRawRow } from "./people-types";
import {
  formatPercent,
  initials,
  isNonGmail,
  pagerWindow,
  type PagerToken,
} from "$lib/people/people-display";

export { formatPercent, initials, isNonGmail, pagerWindow };
export type { PagerToken };

export type Validation<T> = { ok: true; value: T } | { ok: false; error: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isLinked(
  userId: number | null | undefined,
  userExists: boolean
): boolean {
  return typeof userId === "number" && userId > 1 && userExists;
}

export type StaffInput = {
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  designationId: number;
  departmentId: number;
  roleId: number;
  genderId: number;
  qualification?: string;
  experience?: string;
};

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function validateStaffInput(input: StaffInput): Validation<StaffInput> {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const mobile = (input.mobile ?? "").trim();

  if (!firstName) return { ok: false, error: "First name is required" };
  if (firstName.length > 100) return { ok: false, error: "First name is too long" };
  if (!lastName) return { ok: false, error: "Last name is required" };
  if (lastName.length > 100) return { ok: false, error: "Last name is too long" };
  if (!email) return { ok: false, error: "Email is required" };
  if (email.length > 50) return { ok: false, error: "Email must be 50 characters or fewer" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email address" };
  if (mobile.length > 50) return { ok: false, error: "Mobile must be 50 characters or fewer" };

  const ids: [string, number][] = [
    ["designation", input.designationId],
    ["department", input.departmentId],
    ["role", input.roleId],
    ["gender", input.genderId],
  ];
  for (const [label, value] of ids) {
    if (!isPositiveInt(value)) return { ok: false, error: `Select a valid ${label}` };
  }

  return {
    ok: true,
    value: {
      ...input,
      firstName,
      lastName,
      email,
      mobile,
    },
  };
}

export type ParentContactFields = {
  guardianEmail: string;
  guardianMobile: string;
};

export type ParentContactValue = {
  guardianEmail: string | null;
  guardianMobile: string | null;
};

export function validateParentContact(
  input: ParentContactFields
): Validation<ParentContactValue> {
  const guardianEmail = input.guardianEmail.trim();
  const guardianMobile = input.guardianMobile.trim();

  if (guardianEmail.length > 200) {
    return { ok: false, error: "Email must be 200 characters or fewer" };
  }
  if (guardianEmail && !EMAIL_RE.test(guardianEmail)) {
    return { ok: false, error: "Enter a valid email address" };
  }
  if (guardianMobile.length > 200) {
    return { ok: false, error: "Mobile must be 200 characters or fewer" };
  }

  return {
    ok: true,
    value: {
      guardianEmail: guardianEmail || null,
      guardianMobile: guardianMobile || null,
    },
  };
}

export function isSelfAssignEnabled(autoApprove: number | null | undefined): boolean {
  return autoApprove === 1;
}

export type OfferingClassification = "skip" | "reactivate" | "create";

export function classifyOffering(
  existing: { activeStatus: number } | null | undefined
): OfferingClassification {
  if (!existing) return "create";
  return existing.activeStatus === 1 ? "skip" : "reactivate";
}

export function needsReplacement(
  currentTeacherId: number | null,
  targetTeacherId: number
): boolean {
  return currentTeacherId !== null && currentTeacherId !== targetTeacherId;
}

export function mapConflictRows(rows: ConflictRawRow[]): ConflictGroup[] {
  const groups: ConflictGroup[] = [];
  for (const row of rows) {
    if (row.classId === null || row.sectionId === null || row.subjectId === null) continue;
    const teacherIds = (row.teacherIds ?? "")
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    groups.push({
      classId: row.classId,
      sectionId: row.sectionId,
      subjectId: row.subjectId,
      activeTeachers: Number(row.activeTeachers ?? 0),
      teacherIds,
    });
  }
  return groups;
}

export type SelectedClassOption = {
  classId: number;
  sectionId: number;
  className: string | null;
  sectionName: string | null;
};

export function buildSelectedClassCookieValue(
  option: SelectedClassOption,
  academicId: number
): string {
  return JSON.stringify({
    classId: option.classId,
    sectionId: option.sectionId,
    academicId,
    className: option.className,
    sectionName: option.sectionName,
  });
}
