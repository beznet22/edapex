import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import { canAccessPeople, isAdminOrIt } from "$lib/server/people/people-access";

export const GET: RequestHandler = async ({ locals, params }) => {
  const user = locals.user;
  if (!user || !canAccessPeople(user)) {
    error(403, "You do not have access to this student");
  }

  const studentId = Number(params.id);
  if (!Number.isInteger(studentId) || studentId <= 0) {
    error(400, "Invalid student");
  }

  const schoolId = user.schoolId ?? 1;
  const canManage = isAdminOrIt(user);
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );
  const results = provider.getRepo(ResultsRepository);
  const students = provider.getRepo(StudentRepository);

  const activeYear = await results.getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;
  if (academicId === null) error(400, "No active academic year");

  const student = await students.getStudentForEdit({ studentId, schoolId, academicId });
  if (!student) error(404, "Student not found");

  // Teachers may inspect only students in the classes they are assigned to.
  if (!canManage) {
    const staffId = typeof user.staffId === "number" ? user.staffId : 0;
    const allowed = await results.getAssignedClassSections({ staffId, schoolId, academicId });
    const visible = allowed.some(
      (option) => option.classId === student.classId && option.sectionId === student.sectionId
    );
    if (!visible) error(403, "This student is not in one of your classes");
  }

  const options = await students.getStudentEditOptions();
  return json({ student, options, canManage });
};
