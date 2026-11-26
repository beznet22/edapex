import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import { isAdminOrIt } from "$lib/server/people/people-access";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) error(401, "Sign in to search students");
  if (!isAdminOrIt(user)) error(403, "Student search requires admin or IT");

  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (query.length < 2) return json({ results: [] });

  const schoolId = user.schoolId ?? 1;
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );

  const activeYear = await provider.getRepo(ResultsRepository).getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;
  if (academicId === null) return json({ results: [] });

  const results = await provider.getRepo(StudentRepository).searchStudentsForSibling({
    schoolId,
    academicId,
    q: query,
  });

  return json({ results });
};
