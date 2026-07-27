import { json, error } from "@sveltejs/kit";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { StudentRepository } from "$lib/server/repository";
import { getDatabase } from "$lib/server/db";
import type { RequestHandler } from "@sveltejs/kit";

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) throw error(401);
  const schoolId = locals.user.schoolId ?? 1;

  const formData = await request.formData();
  const studentId = Number(formData.get("studentId"));
  const active = formData.get("active") === "true";

  if (!studentId) {
    return json({ error: "studentId required" }, { status: 400 });
  }

  const tenant = createTenantContext({
    schoolId,
    userId: locals.user.id,
    staffId: locals.user.staffId,
  });
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(db, tenant);
  const studentRepo = provider.getRepo(StudentRepository);

  const result = await studentRepo.updateStudentStatus({ studentId, active });

  return json(result);
};
