import { json } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { resolveWorkspaceContext } from "$lib/server/helpers/chat-helper";
import { commitMarksheetTool } from "$lib/server/mastra/tools/operations/reporting/marksheet/commit-marksheet";
import { StudentRepository } from "$lib/server/repository";
import type { RequestHandler } from "@sveltejs/kit";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import type { AuthUser } from "$lib/types/auth-types";

async function commit(admissionNo: number, locals: App.Locals, cookies: { get: (key: string) => string | undefined }) {
  if (!locals.user) throw new Error("User not found");

  const { id, schoolId, staffId } = locals.user as AuthUser;
  const { tenant, requestContext } = await resolveWorkspaceContext(cookies, {
    id, schoolId, staffId,
    designationId: ALLOWED_DESIGNATIONS.IT,
  });

  const db = await getDatabase();
  const studentRepo = await StudentRepository.build(db, tenant);
  const student = await studentRepo.getStudentById(admissionNo, true);
  if (!student?.studentId) throw new Error("Student not found");

  const executeFn = commitMarksheetTool.execute;
  if (typeof executeFn !== "function") throw new Error("commitMarksheetTool.execute is not bound");
  const result = await executeFn(
    { studentId: student.studentId, reason: "Demo commit marksheet" },
    { requestContext: requestContext as never } as never,
  );
  return result;
}

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const { admissionNo } = await request.json();
  return json(await commit(admissionNo, locals, cookies));
};

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const admissionNo = Number(url.searchParams.get("admissionNo"));
  if (!admissionNo) return json({ message: "admissionNo query param required" }, { status: 400 });
  return json(await commit(admissionNo, locals, cookies));
};
