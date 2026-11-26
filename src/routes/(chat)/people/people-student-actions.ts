import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStudents } from "$lib/server/db/sms-schema";
import { StudentRepository } from "$lib/server/repository/student.repo";
import {
  formNumber,
  formString,
  isActiveClass,
  requireManager,
  resolveAcademicId,
  type ActionResult,
} from "./people-action-context";
import type { AuthUser } from "$lib/types/auth-types";
import type { GuardianRelation } from "$lib/server/repository/student.repo";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Autosave handler for the student detail modal. Only fields that
 * `StudentRepository.updateStudent` supports are accepted; class/section are
 * intentionally read-only here so a roster row cannot be moved by accident.
 */
export async function updateStudentAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const studentId = formNumber(form, "studentId");
  if (studentId <= 0) return { ok: false, status: 400, error: "Select a student" };

  const db = await getDatabase();
  const [current] = await db
    .select({ id: smStudents.id })
    .from(smStudents)
    .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, context.schoolId)))
    .limit(1);
  if (!current) {
    return { ok: false, status: 400, error: "That student is not in your school" };
  }

  const firstName = formString(form, "firstName").trim();
  const lastName = formString(form, "lastName").trim();
  if (!firstName && !lastName) {
    return { ok: false, status: 400, error: "First or last name is required" };
  }
  if (firstName.length > 200 || lastName.length > 200) {
    return { ok: false, status: 400, error: "Name is too long" };
  }

  const dateRaw = formString(form, "dateOfBirth").trim();
  let dateOfBirth: string | null = null;
  if (dateRaw) {
    if (!DATE_RE.test(dateRaw) || Number.isNaN(Date.parse(dateRaw))) {
      return { ok: false, status: 400, error: "Enter a valid date of birth" };
    }
    dateOfBirth = dateRaw;
  }

  const genderRaw = formString(form, "genderId").trim();
  const genderId = genderRaw ? formNumber(form, "genderId") : 0;
  if (genderRaw && genderId <= 0) {
    return { ok: false, status: 400, error: "Select a valid gender" };
  }

  const categoryRaw = formString(form, "studentCategoryId").trim();
  const studentCategoryId = categoryRaw ? formNumber(form, "studentCategoryId") : 0;
  if (categoryRaw && studentCategoryId <= 0) {
    return { ok: false, status: 400, error: "Select a valid category" };
  }

  const rollRaw = formString(form, "rollNo").trim();
  let rollNo: number | null = null;
  if (rollRaw) {
    const parsed = Number(rollRaw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, status: 400, error: "Roll number must be a whole number" };
    }
    rollNo = parsed;
  }

  try {
    await context.provider.getRepo(StudentRepository).updateStudent({
      studentId,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      dateOfBirth,
      genderId: genderId || null,
      studentCategoryId: studentCategoryId || null,
      rollNo,
    });
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Could not update the student" };
  }
}

export async function setStudentActiveAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<ActionResult> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const studentId = formNumber(form, "studentId");
  if (studentId <= 0) return { ok: false, status: 400, error: "Select a student" };
  const active = formString(form, "active") === "true";

  const db = await getDatabase();
  const [current] = await db
    .select({ id: smStudents.id })
    .from(smStudents)
    .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, context.schoolId)))
    .limit(1);
  if (!current) {
    return { ok: false, status: 400, error: "That student is not in your school" };
  }

  try {
    await context.provider.getRepo(StudentRepository).updateStudentStatus({ studentId, active });
    return { ok: true };
  } catch {
    return { ok: false, status: 500, error: "Could not update the student status" };
  }
}

/**
 * Create a student and its login. Parent handling is delegated to
 * `StudentRepository.createStudentIfNotExists`, which:
 *   - reuses the parent of `siblingAdmissionNo` when provided,
 *   - otherwise matches an existing parent by guardian email,
 *   - otherwise creates a parent user + `sm_parents` row.
 * The returned passwords are surfaced once by the dialog.
 */
export async function createStudentAction(
  user: AuthUser | null | undefined,
  form: FormData
): Promise<
  ActionResult & {
    studentId?: number;
    studentPassword?: string;
    parentPassword?: string;
  }
> {
  const context = await requireManager(user);
  if (!context) return { ok: false, status: 403, error: "Not permitted" };

  const firstName = formString(form, "firstName").trim();
  const lastName = formString(form, "lastName").trim();
  if (!firstName || !lastName) {
    return { ok: false, status: 400, error: "Student first and last name are required" };
  }
  if (firstName.length > 200 || lastName.length > 200) {
    return { ok: false, status: 400, error: "Name is too long" };
  }

  const email = formString(form, "email").trim().toLowerCase();
  if (email && (email.length > 192 || !EMAIL_RE.test(email))) {
    return { ok: false, status: 400, error: "Enter a valid student email" };
  }

  const classId = formNumber(form, "classId");
  const sectionId = formNumber(form, "sectionId");
  if (classId <= 0 || sectionId <= 0) {
    return { ok: false, status: 400, error: "Select a class and section" };
  }

  const genderId = formNumber(form, "genderId");
  if (genderId <= 0) return { ok: false, status: 400, error: "Select a gender" };
  const studentCategoryId = formNumber(form, "studentCategoryId");
  if (studentCategoryId <= 0) {
    return { ok: false, status: 400, error: "Select a category" };
  }

  const dateRaw = formString(form, "dateOfBirth").trim();
  let dateOfBirth: string | undefined;
  if (dateRaw) {
    if (!DATE_RE.test(dateRaw) || Number.isNaN(Date.parse(dateRaw))) {
      return { ok: false, status: 400, error: "Enter a valid date of birth" };
    }
    dateOfBirth = dateRaw;
  }

  const guardiansName = formString(form, "guardiansName").trim();
  const guardiansEmail = formString(form, "guardiansEmail").trim().toLowerCase();
  const guardiansMobile = formString(form, "guardiansMobile").trim();
  if (!guardiansName) {
    return { ok: false, status: 400, error: "Guardian name is required" };
  }
  if (!guardiansEmail || !EMAIL_RE.test(guardiansEmail)) {
    return { ok: false, status: 400, error: "Enter a valid guardian email" };
  }
  if (guardiansEmail.length > 200) {
    return { ok: false, status: 400, error: "Guardian email is too long" };
  }
  const relationRaw = formString(form, "guardianRelation");
  const guardianRelation: GuardianRelation =
    relationRaw === "father" || relationRaw === "mother" ? relationRaw : "other";

  const siblingRaw = formString(form, "siblingAdmissionNo").trim();
  let siblingAdmissionNo: number | undefined;
  if (siblingRaw) {
    const parsed = Number(siblingRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return {
        ok: false,
        status: 400,
        error: "Sibling admission number must be a whole number",
      };
    }
    siblingAdmissionNo = parsed;
  }

  const admissionRaw = formString(form, "admissionNo").trim();
  let admissionNo: number | undefined;
  if (admissionRaw) {
    const parsed = Number(admissionRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { ok: false, status: 400, error: "Admission number must be a whole number" };
    }
    admissionNo = parsed;
  }

  const academicId = await resolveAcademicId(context.provider);
  if (academicId === null) {
    return { ok: false, status: 400, error: "No active academic year" };
  }
  if (
    !(await isActiveClass(context.provider, context.schoolId, academicId, classId, sectionId))
  ) {
    return { ok: false, status: 400, error: "That class is not active this year" };
  }

  try {
    const created = await context.provider.getRepo(StudentRepository).createStudentIfNotExists({
      admissionNo,
      firstName,
      lastName,
      email: email || undefined,
      mobile: formString(form, "mobile").trim() || undefined,
      dateOfBirth,
      classId,
      sectionId,
      genderId,
      studentCategoryId,
      schoolId: context.schoolId,
      academicId,
      guardianRelation,
      guardiansName,
      guardiansMobile,
      guardiansEmail,
      siblingAdmissionNo,
    });
    return {
      ok: true,
      studentId: created.id,
      studentPassword: created.studentPassword,
      parentPassword: created.parentPassword,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "USER_EXISTS") {
      return { ok: false, status: 400, error: "A login with that email already exists" };
    }
    return { ok: false, status: 500, error: "Could not create the student" };
  }
}
