import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import { canAccessPeople, isAdminOrIt } from "$lib/server/people/people-access";
import { getScanStatuses } from "$lib/server/people/scan/scan-status";

/**
 * Scanner hydration. Resolves the roster of the student's own class so Prev/Next can walk it
 * without returning to `/people`, and refuses any student outside the teacher's classes.
 */
export const load: PageServerLoad = async ({ locals, params, url }) => {
  const user = locals.user;
  if (!user || !canAccessPeople(user)) {
    error(403, "You do not have access to marks scanning");
  }

  const studentId = Number(params.studentId);
  if (!Number.isInteger(studentId) || studentId <= 0) error(400, "Invalid student");

  const schoolId = user.schoolId ?? 1;
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId ?? undefined })
  );
  const results = provider.getRepo(ResultsRepository);
  const students = provider.getRepo(StudentRepository);

  const activeYear = await results.getActiveAcademicYear();
  if (!activeYear) error(400, "No active academic year");
  const academicId = activeYear.id;

  const canManage = isAdminOrIt(user);
  const allowed = canManage
    ? await results.getAssignedClassSections({
        staffId: 0,
        schoolId,
        academicId,
      })
    : await results.getAssignedClassSections({
        staffId: typeof user.staffId === "number" ? user.staffId : 0,
        schoolId,
        academicId,
      });

  const detail = await students.getStudentForEdit({ studentId, schoolId, academicId });
  if (!detail) error(404, "Student not found");

  if (!canManage) {
    const visible = allowed.some(
      (option) =>
        option.classId === detail.classId && option.sectionId === detail.sectionId
    );
    if (!visible) error(403, "This student is not in one of your classes");
  }

  const requestedExam = Number(url.searchParams.get("exam"));
  const examTypes = await results.getExamTypes();
  const examTypeId =
    Number.isInteger(requestedExam) && requestedExam > 0
      ? requestedExam
      : examTypes.length > 0
        ? (examTypes[examTypes.length - 1].id ?? null)
        : null;

  const roster =
    detail.classId !== null && detail.sectionId !== null
      ? await students.getStudentsByClassSection({
          classId: detail.classId,
          sectionId: detail.sectionId,
        })
      : null;

  const rosterIds = (roster ?? [])
    .map((row) => row.id)
    .filter((id): id is number => typeof id === "number" && id > 0);

  const statuses =
    examTypeId !== null && rosterIds.length > 0
      ? await getScanStatuses({ schoolId, academicId, examTypeId, studentIds: rosterIds })
      : new Map<number, never>();

  return {
    student: {
      id: detail.id,
      fullName: detail.fullName ?? "",
      admissionNo: detail.admissionNo ?? 0,
      className: detail.className ?? "",
      sectionName: detail.sectionName ?? "",
      classId: detail.classId,
      sectionId: detail.sectionId,
    },
    examTypeId,
    examTitle: examTypes.find((examType) => examType.id === examTypeId)?.title ?? null,
    roster: rosterIds.map((id) => {
      const row = (roster ?? []).find((entry) => entry.id === id);
      return {
        id,
        fullName: row?.name ?? "",
        admissionNo: row?.admissionNo ?? 0,
        status: statuses.get(id) ?? "not_uploaded",
      };
    }),
  };
};
