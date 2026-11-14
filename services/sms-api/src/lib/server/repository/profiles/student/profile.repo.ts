import { and, eq } from "drizzle-orm";

import { smStudents, studentRecords } from "../../../db/schema";
import { batchOrThrow } from "../../base/d1-helpers";
import { DbEntityNotFoundError, DbInternalError } from "../../base/errors";
import { withErrorHandling } from "../../base/error-handling";
import { requireAcademicId } from "../../base/repository-context";
import type { ScopedRepositoryContext } from "../../base/repository-context";
import type {
  CreateStudentInput,
  CreatedStudent,
  StudentDeleteResult,
  StudentPatch,
  StudentRow,
  StudentStatusResult
} from "./types";

export async function findStudentById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<StudentRow | null> {
  if (id <= 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smStudents)
      .where(and(eq(smStudents.id, id), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return row ?? null;
  }, "findStudentById");
}

/**
 * Creates the student row and its default placement record. The generated id
 * is read back before inserting the record (D1 cannot return an id mid-batch),
 * and a failed record insert compensates by deleting the student.
 *
 * User and parent provisioning is orchestration (Phase 3); this primitive
 * receives both ids from the caller.
 */
export async function createStudentWithRecord(
  ctx: ScopedRepositoryContext,
  input: CreateStudentInput
): Promise<CreatedStudent> {
  return withErrorHandling(async () => {
    const academicId = requireAcademicId(ctx);
    const schoolId = ctx.tenant.schoolId;
    const fullName = input.fullName ?? `${input.firstName} ${input.lastName}`.trim();

    const [duplicate] = await ctx.db
      .select({ id: smStudents.id })
      .from(smStudents)
      .where(
        and(
          eq(smStudents.admissionNo, input.admissionNo),
          eq(smStudents.schoolId, schoolId)
        )
      )
      .limit(1);
    if (duplicate !== undefined) {
      throw new DbInternalError(
        `Admission number ${input.admissionNo} already exists in this school`
      );
    }

    const [inserted] = await ctx.db
      .insert(smStudents)
      .values({
        admissionNo: input.admissionNo,
        firstName: input.firstName,
        lastName: input.lastName,
        fullName,
        email: input.email,
        mobile: input.mobile,
        dateOfBirth: input.dateOfBirth,
        classId: input.classId,
        sectionId: input.sectionId,
        genderId: input.genderId,
        studentCategoryId: input.studentCategoryId,
        userId: input.userId,
        parentId: input.parentId,
        roleId: input.roleId,
        schoolId,
        academicId,
        activeStatus: 1,
        status: "active",
        bloodgroupId: null,
        religionId: null,
        routeListId: null,
        dormitoryId: null,
        vechileId: null,
        roomId: null,
        studentGroupId: null
      })
      .returning();
    if (inserted === undefined) {
      throw new DbInternalError("Insert into sm_students returned no row");
    }

    try {
      const [record] = await ctx.db
        .insert(studentRecords)
        .values({
          studentId: inserted.id,
          classId: input.classId,
          sectionId: input.sectionId,
          academicId,
          schoolId,
          isDefault: 1,
          isPromote: 0,
          activeStatus: 1,
          status: "current"
        })
        .returning({ id: studentRecords.id });
      if (record === undefined) {
        throw new DbInternalError("Insert into student_records returned no id");
      }
      await ctx.db.update(smStudents).set({ currentRecordId: record.id }).where(
        and(eq(smStudents.id, inserted.id), eq(smStudents.schoolId, schoolId))
      );
      return {
        student: { ...inserted, currentRecordId: record.id },
        recordId: record.id
      };
    } catch (error) {
      await ctx.db.delete(smStudents).where(eq(smStudents.id, inserted.id));
      throw error;
    }
  }, "createStudentWithRecord");
}

export async function updateStudent(
  ctx: ScopedRepositoryContext,
  studentId: number,
  patch: StudentPatch
): Promise<StudentRow | null> {
  return withErrorHandling(async () => {
    if (Object.keys(patch).length === 0) return null;
    const rows = await ctx.db
      .update(smStudents)
      .set(patch)
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .returning();
    return rows[0] ?? null;
  }, "updateStudent");
}

export async function updateStudentPhoto(
  ctx: ScopedRepositoryContext,
  studentId: number,
  photoPath: string | null
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(smStudents)
      .set({ studentPhoto: photoPath })
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .returning({ id: smStudents.id });
    return rows.length > 0;
  }, "updateStudentPhoto");
}

export async function updateStudentCategoryId(
  ctx: ScopedRepositoryContext,
  studentId: number,
  studentCategoryId: number
): Promise<boolean> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(smStudents)
      .set({ studentCategoryId })
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .returning({ id: smStudents.id });
    return rows.length > 0;
  }, "updateStudentCategoryId");
}

export async function findRollAndAdmission(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<{ readonly rollNo: number | null; readonly admissionNo: number | null }> {
  if (studentId <= 0) return { rollNo: null, admissionNo: null };
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ rollNo: smStudents.rollNo, admissionNo: smStudents.admissionNo })
      .from(smStudents)
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    return {
      rollNo: row?.rollNo ?? null,
      admissionNo: row?.admissionNo ?? null
    };
  }, "findRollAndAdmission");
}

/**
 * Updates the student and all of its placement records atomically. The linked
 * user's active status is a separate accounts write owned by Phase 3.
 */
export async function updateStudentStatus(
  ctx: ScopedRepositoryContext,
  studentId: number,
  active: boolean
): Promise<StudentStatusResult> {
  return withErrorHandling(async () => {
    const [student] = await ctx.db
      .select({ id: smStudents.id, fullName: smStudents.fullName })
      .from(smStudents)
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    if (student === undefined) {
      throw new DbEntityNotFoundError("Student", studentId);
    }

    const activeStatus = active ? 1 : 0;
    await batchOrThrow(ctx.db, [
      ctx.db
        .update(smStudents)
        .set({ activeStatus })
        .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId))),
      ctx.db
        .update(studentRecords)
        .set({ activeStatus })
        .where(eq(studentRecords.studentId, studentId))
    ]);
    return { success: true, studentId, fullName: student.fullName, active };
  }, "updateStudentStatus");
}

/**
 * Deletes the placement records and the student atomically. The linked user is
 * retained: account deletion is decided by the service layer.
 */
export async function deleteStudent(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<StudentDeleteResult> {
  return withErrorHandling(async () => {
    const [student] = await ctx.db
      .select({ id: smStudents.id, fullName: smStudents.fullName })
      .from(smStudents)
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    if (student === undefined) {
      throw new DbInternalError(`Student with id '${studentId}' not found`);
    }

    await batchOrThrow(ctx.db, [
      ctx.db.delete(studentRecords).where(eq(studentRecords.studentId, studentId)),
      ctx.db
        .delete(smStudents)
        .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
    ]);
    return { success: true, studentId, fullName: student.fullName };
  }, "deleteStudent");
}
