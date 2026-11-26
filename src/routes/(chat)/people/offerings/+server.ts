import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { AssignmentRepository } from "$lib/server/repository/assignment.repo";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { isAdminOrIt } from "$lib/server/people/people-access";

export const GET: RequestHandler = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) error(401, "Sign in to view offerings");
  if (!isAdminOrIt(user)) error(403, "Assignment management requires admin or IT");

  const classId = Number(url.searchParams.get("classId"));
  const sectionId = Number(url.searchParams.get("sectionId"));
  if (!Number.isInteger(classId) || !Number.isInteger(sectionId) || classId <= 0 || sectionId <= 0) {
    error(400, "classId and sectionId are required");
  }

  const schoolId = user.schoolId ?? 1;
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );

  const activeYear = await provider.getRepo(ResultsRepository).getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;
  if (academicId === null) return json([]);

  const offerings = await provider.getRepo(AssignmentRepository).listOfferings({
    schoolId,
    academicId,
    classId,
    sectionId,
  });

  return json(offerings);
};
