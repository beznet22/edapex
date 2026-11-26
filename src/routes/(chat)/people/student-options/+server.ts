import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import { isAdminOrIt } from "$lib/server/people/people-access";
import type { ClassOption } from "$lib/server/people/people-types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  if (!user) error(401, "Sign in to view options");
  if (!isAdminOrIt(user)) error(403, "Student creation requires admin or IT");

  const schoolId = user.schoolId ?? 1;
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );
  const results = provider.getRepo(ResultsRepository);
  const students = provider.getRepo(StudentRepository);

  const activeYear = await results.getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;
  if (academicId === null) {
    return json({ classes: [], genders: [], categories: [] });
  }

  const [classRows, editOptions] = await Promise.all([
    results.getClassSections({ schoolId, academicId }),
    students.getStudentEditOptions(),
  ]);

  const classes: ClassOption[] = classRows
    .filter((row) => row.classId !== null && row.sectionId !== null)
    .map((row) => ({
      classId: row.classId as number,
      className: row.className,
      sectionId: row.sectionId as number,
      sectionName: row.sectionName,
    }));

  return json({
    classes,
    genders: editOptions.genders,
    categories: editOptions.categories,
  });
};
