import { error } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smExamTypes, smStudents, studentRecords } from "$lib/server/db/sms-schema";
import { canAccessPeople, isAdminOrIt } from "$lib/server/people/people-access";
import type { AuthUser } from "$lib/types/auth-types";

/**
 * Scan authorization is enforced server-side on every request; the "student-locked" camera is a
 * UI affordance only. Scope resolves through `student_id -> sm_students.school_id` because
 * `teacher_remarks` carries no `school_id` of its own (plan §7).
 */

export interface ScanScopeInput {
  user: AuthUser | null | undefined;
  studentId: number;
  schoolId: number;
  academicId: number;
  examTypeId: number;
  allowedClassSections: { classId: number; sectionId: number }[];
}

export type ScanScopeDecision =
  | { ok: true }
  | {
      ok: false;
      reason: "unauthenticated" | "bad-student" | "bad-exam" | "out-of-school" | "out-of-class";
    };

export const canScanStudent = (input: {
  isManager: boolean;
  student: { schoolId: number | null; classId: number | null; sectionId: number | null } | null;
  schoolId: number;
  allowedClassSections: { classId: number; sectionId: number }[];
}): ScanScopeDecision => {
  const { isManager, student, schoolId, allowedClassSections } = input;
  if (!student) return { ok: false, reason: "out-of-school" };
  if (student.schoolId !== null && student.schoolId !== schoolId) {
    return { ok: false, reason: "out-of-school" };
  }
  if (isManager) return { ok: true };
  if (student.classId === null || student.sectionId === null) {
    return { ok: false, reason: "out-of-class" };
  }
  const visible = allowedClassSections.some(
    (option) => option.classId === student.classId && option.sectionId === student.sectionId
  );
  return visible ? { ok: true } : { ok: false, reason: "out-of-class" };
};

const MESSAGES: Record<Exclude<ScanScopeDecision, { ok: true }>["reason"], string> = {
  unauthenticated: "You do not have access to this student",
  "bad-student": "Invalid student",
  "bad-exam": "Invalid exam type",
  "out-of-school": "Student not found",
  "out-of-class": "This student is not in one of your classes",
};

/**
 * Resolves and enforces scan scope. Throws a SvelteKit `HttpError` on every failure — callers
 * never see a partially-valid scope.
 */
export async function assertScanScope(input: {
  user: AuthUser | null | undefined;
  studentId: number;
  examTypeId: number;
  schoolId: number;
  academicId: number;
  allowedClassSections: { classId: number; sectionId: number }[];
}): Promise<void> {
  const fail = (reason: Exclude<ScanScopeDecision, { ok: true }>["reason"]): never => {
    const status = reason === "unauthenticated" || reason === "out-of-class" ? 403 : 400;
    error(status, MESSAGES[reason]);
  };

  if (!input.user || !canAccessPeople(input.user)) fail("unauthenticated");
  if (!Number.isInteger(input.studentId) || input.studentId <= 0) fail("bad-student");
  if (!Number.isInteger(input.examTypeId) || input.examTypeId <= 0) fail("bad-exam");
  if (!Number.isInteger(input.academicId) || input.academicId <= 0) fail("bad-exam");

  const db = await getDatabase();
  const [student] = await db
    .select({
      schoolId: smStudents.schoolId,
      classId: studentRecords.classId,
      sectionId: studentRecords.sectionId,
    })
    .from(smStudents)
    .leftJoin(
      studentRecords,
      and(
        eq(studentRecords.studentId, smStudents.id),
        eq(studentRecords.academicId, input.academicId),
        eq(studentRecords.schoolId, input.schoolId)
      )
    )
    .where(and(eq(smStudents.id, input.studentId), eq(smStudents.schoolId, input.schoolId)))
    .limit(1);

  const decision = canScanStudent({
    isManager: isAdminOrIt(input.user),
    student: student ?? null,
    schoolId: input.schoolId,
    allowedClassSections: input.allowedClassSections,
  });
  if (!decision.ok) fail(decision.reason);

  const [exam] = await db
    .select({ id: smExamTypes.id, schoolId: smExamTypes.schoolId, academicId: smExamTypes.academicId })
    .from(smExamTypes)
    .where(and(eq(smExamTypes.id, input.examTypeId), eq(smExamTypes.academicId, input.academicId)))
    .limit(1);

  if (!exam) fail("bad-exam");
  if (exam.schoolId !== null && exam.schoolId !== input.schoolId) fail("bad-exam");
}

/**
 * `teacher_remarks` has a nullable unique key, so MySQL will not enforce one row per
 * (student, exam, academic) when any part is NULL. The store refuses to write in that case.
 */
export const assertWritableKey = (input: {
  studentId: number | null;
  examTypeId: number | null;
  academicId: number | null;
}): { studentId: number; examTypeId: number; academicId: number } => {
  const { studentId, examTypeId, academicId } = input;
  if (studentId === null || examTypeId === null || academicId === null) {
    throw new Error("Refusing to write scan metadata without student, exam and academic ids");
  }
  return { studentId, examTypeId, academicId };
};
