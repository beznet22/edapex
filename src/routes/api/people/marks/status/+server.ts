import { json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { StudentRepository } from "$lib/server/repository/student.repo";
import { countScanStatuses, getScanStatuses, shouldPoll } from "$lib/server/people/scan/scan-status";
import {
  guard,
  requireNumber,
  resolveScanRequest,
  ScanRequestError,
} from "$lib/server/people/scan/scan-request";

export const GET: RequestHandler = async ({ url, locals }) =>
  guard(async () => {
    const context = await resolveScanRequest({ user: locals.user, url });

    const classId = requireNumber(url.searchParams.get("class"), "class");
    const sectionId = requireNumber(url.searchParams.get("section"), "section");
    const examTypeId = requireNumber(url.searchParams.get("exam"), "exam");

    if (
      !context.isManager &&
      !context.allowedClassSections.some(
        (option) => option.classId === classId && option.sectionId === sectionId
      )
    ) {
      throw new ScanRequestError("This class is not one of yours", 403);
    }

    const db = await getDatabase();
    const provider = new ScopedRepositoryProvider(
      db,
      createTenantContext({
        schoolId: context.schoolId,
        userId: context.user.id,
        staffId: context.user.staffId ?? undefined,
      })
    );
    const students = provider.getRepo(StudentRepository);
    const results = provider.getRepo(ResultsRepository);

    void results;

    const roster = await students.getStudentsByClassSection({ classId, sectionId });
    const studentIds = (roster ?? [])
      .map((row) => row.id)
      .filter((id): id is number => typeof id === "number" && id > 0);

    const statuses = await getScanStatuses({
      schoolId: context.schoolId,
      academicId: context.academicId,
      examTypeId,
      studentIds,
    });

    return json(
      {
        statuses: Object.fromEntries(statuses),
        counts: countScanStatuses(statuses),
        poll: shouldPoll(statuses),
      },
      { headers: { "cache-control": "no-store" } }
    );
  });
