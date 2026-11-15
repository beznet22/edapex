import { json } from "@sveltejs/kit";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { resolveClassNamesByIds } from "$lib/server/helpers/class-scope";
import { readManifest } from "$lib/server/workspace/manifest";
import { classDir } from "$lib/server/workspace/paths";
import { ALLOWED_DESIGNATIONS } from "$lib/types/sms-types";
import type { RequestHandler } from "@sveltejs/kit";

export const GET: RequestHandler = async ({ url }) => {
  const schoolId = Number(url.searchParams.get("schoolId") ?? 1);
  const academicId = Number(url.searchParams.get("academicId") ?? 4);
  const classId = Number(url.searchParams.get("classId") ?? 12);
  const sectionId = Number(url.searchParams.get("sectionId") ?? 5);
  const examTypeIdStr = url.searchParams.get("examTypeId");
  const examTypeId = examTypeIdStr ? Number(examTypeIdStr) : 7;
  const studentIdStr = url.searchParams.get("studentId");
  const studentId = studentIdStr ? Number(studentIdStr) : null;

  const displayNames = await resolveClassNamesByIds({
    schoolId,
    classId,
    sectionId,
    academicId,
  });

  const tenant = createTenantContext({
    schoolId,
    userId: 1,
    staffId: 4,
    designationId: ALLOWED_DESIGNATIONS.IT,
    classId,
    sectionId,
    examId: null,
    examTypeId,
    academicId,
    studentId,
    className: displayNames.className,
    sectionName: displayNames.sectionName,
    academicYearTitle: displayNames.academicYearTitle,
  });

  const workspaceDir = classDir(tenant);

  let manifest: unknown = null;
  try {
    manifest = await readManifest(tenant, examTypeId);
  } catch {
    // manifest may not exist
  }

  return json({
    tenant,
    workspace: {
      path: workspaceDir,
      manifest,
    },
  });
};
