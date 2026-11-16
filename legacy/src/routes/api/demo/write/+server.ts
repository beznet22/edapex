import { json } from "@sveltejs/kit";
import { resolveWorkspaceContext } from "$lib/server/helpers/chat-helper";
import type { RequestHandler } from "@sveltejs/kit";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import type { AuthUser } from "$lib/types/auth-types";

import { admitStudentTool } from "$lib/server/mastra/tools/operations/write/admit-student";
import { transferStudentTool } from "$lib/server/mastra/tools/operations/write/transfer-student";
import { updateRecordTool } from "$lib/server/mastra/tools/operations/write/update-record";
import { promoteStudentTool } from "$lib/server/mastra/tools/operations/write/promote-student";
import { demoteStudentTool } from "$lib/server/mastra/tools/operations/write/demote-student";
import { enrollStaffTool } from "$lib/server/mastra/tools/operations/write/enroll-staff";
import { updateStaffBiodataTool } from "$lib/server/mastra/tools/operations/write/update-staff-biodata";
import { assignStaffToClassTool } from "$lib/server/mastra/tools/operations/write/assign-staff-to-class";
import { assignStaffToSubjectTool } from "$lib/server/mastra/tools/operations/write/assign-staff-to-subject";
import { teacherSelfAssignClassTool } from "$lib/server/mastra/tools/operations/write/teacher-self-assign-class";
import { updatePhotoTool } from "$lib/server/mastra/tools/operations/write/update-photo";

const toolMap: Record<string, { execute: (...args: any[]) => any }> = {
  "admit-student": admitStudentTool as any,
  "transfer-student": transferStudentTool as any,
  "update-record": updateRecordTool as any,
  "promote-student": promoteStudentTool as any,
  "demote-student": demoteStudentTool as any,
  "enroll-staff": enrollStaffTool as any,
  "update-staff-biodata": updateStaffBiodataTool as any,
  "assign-staff-to-class": assignStaffToClassTool as any,
  "assign-staff-to-subject": assignStaffToSubjectTool as any,
  "teacher-self-assign-class": teacherSelfAssignClassTool as any,
  "update-photo": updatePhotoTool as any,
};

async function runTool(
  toolName: string,
  input: Record<string, unknown>,
  cookies: { get: (key: string) => string | undefined },
  locals: App.Locals,
) {
  if (!locals.user) throw new Error("User not found");

  const { id, schoolId, staffId } = locals.user as AuthUser;
  const { requestContext } = await resolveWorkspaceContext(cookies, {
    id, schoolId, staffId,
    designationId: ALLOWED_DESIGNATIONS.IT,
  });

  const tool = toolMap[toolName];
  if (!tool) throw new Error(`Unknown tool: ${toolName}`);

  if (!input.reason) {
    input.reason = `Demo ${toolName} via /api/demo/write`;
  }

  return tool.execute(input, { requestContext: requestContext as never } as never);
}

export const POST: RequestHandler = async ({ request, cookies, locals }) => {
  const body = await request.json();
  const { tool: toolName, ...input } = body as { tool: string; [key: string]: unknown };
  if (!toolName) {
    return json({ error: "tool field required" }, { status: 400 });
  }

  try {
    return json(await runTool(toolName, input, cookies, locals));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};

export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const toolName = url.searchParams.get("tool");
  if (!toolName) {
    return json({ error: "tool query param required" }, { status: 400 });
  }

  const inputParam = url.searchParams.get("input");
  if (!inputParam) {
    return json({ error: "input query param required (JSON string)" }, { status: 400 });
  }

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(inputParam) as Record<string, unknown>;
  } catch {
    return json({ error: "input must be valid JSON" }, { status: 400 });
  }

  try {
    return json(await runTool(toolName, input, cookies, locals));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
};
