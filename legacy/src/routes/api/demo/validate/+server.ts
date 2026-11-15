import { readdirSync } from "fs";
import { json } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { classDir } from "$lib/server/workspace/paths";
import { resolveWorkspaceContext } from "$lib/server/helpers/chat-helper";
import { validateMarksheetTool } from "$lib/server/mastra/tools/operations/reporting/marksheet/validate-marksheet";
import { StudentRepository } from "$lib/server/repository";
import type { RequestHandler } from "@sveltejs/kit";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import type { AuthUser } from "$lib/types/auth-types";

async function validateMarksheet(admissionNo: number, locals: App.Locals, cookies: { get: (key: string) => string | undefined }) {
  if (!locals.user) {
    throw new Error("User not found");
  }

  const { id, schoolId, staffId } = locals.user as AuthUser;

  const { tenant, requestContext } = await resolveWorkspaceContext(cookies, {
    id,
    schoolId,
    staffId,
    designationId: ALLOWED_DESIGNATIONS.IT,
  });

  const db = await getDatabase();
  const studentRepo = await StudentRepository.build(db, tenant);
  const student = await studentRepo.getStudentById(admissionNo, true);

  if (!student) {
    throw new Error("Student not found");
  }

  if (!student.studentId || !student.fullName || !student.admissionNo) {
    throw new Error("Invalid student data");
  }

  const marksheetsDir = `${classDir(tenant)}/exams/examType-${tenant.examTypeId}/marksheets`;
  const prefix = `ADM${student.admissionNo}-${tenant.examTypeId}-`;
  const files = readdirSync(marksheetsDir);
  const markdownFile = files.find((f) => f.startsWith(prefix) && f.endsWith(".md"));
  if (!markdownFile) {
    throw new Error(`Marksheet not found for admissionNo ${student.admissionNo}`);
  }

  const executeFn = validateMarksheetTool.execute;
  if (typeof executeFn !== "function") {
    throw new Error("validateMarksheetTool.execute is not bound");
  }

  const result = await executeFn(
    {
      currentMarkdownPath: `exams/examType-${tenant.examTypeId}/marksheets/${markdownFile}`,
      student: { id: student.studentId, fullName: student.fullName, admissionNo: student.admissionNo },
      reason: "Demo validate marksheet",
      title: `${student.fullName} — Result`,
    },
    { requestContext: requestContext as never } as never,
  );

  return result;
}

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const { admissionNo } = await request.json();
  const result = await validateMarksheet(admissionNo, locals, cookies);
  return json(result);
};

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const admissionNo = Number(url.searchParams.get("admissionNo"));
  if (!admissionNo) {
    return json({ message: "admissionNo query param is required" }, { status: 400 });
  }
  const result = await validateMarksheet(admissionNo, locals, cookies);
  return json(result);
};
