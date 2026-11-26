import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { and, eq } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smStaffs } from "$lib/server/db/sms-schema";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { AssignmentRepository } from "$lib/server/repository/assignment.repo";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { SettingsService } from "$lib/server/service/settings.service";
import { isAdminOrIt } from "$lib/server/people/people-access";
import { mapConflictRows } from "$lib/server/people/people-format";
import type { ClassOption } from "$lib/server/people/people-types";

export const GET: RequestHandler = async ({ locals }) => {
  const user = locals.user;
  if (!user) error(401, "Sign in to view assignments");
  if (!isAdminOrIt(user)) error(403, "Assignment management requires admin or IT");

  const schoolId = user.schoolId ?? 1;
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );
  const results = provider.getRepo(ResultsRepository);
  const assignments = provider.getRepo(AssignmentRepository);

  const activeYear = await results.getActiveAcademicYear();
  const academicId = activeYear?.id ?? null;
  if (academicId === null) {
    return json({
      enabled: false,
      subjects: [],
      classes: [],
      conflicts: [],
      offeringCount: 0,
      teachers: [],
    });
  }

  const [enabled, classRows, subjects, conflictRows, teachers] = await Promise.all([
    new SettingsService(schoolId).getTeacherSelfAssignEnabled(),
    results.getClassSections({ schoolId, academicId }),
    assignments.listSubjectOptions({ schoolId, academicId }),
    assignments.listConflicts({ schoolId, academicId }),
    db
      .select({
        id: smStaffs.id,
        fullName: smStaffs.fullName,
        firstName: smStaffs.firstName,
        lastName: smStaffs.lastName,
      })
      .from(smStaffs)
      .where(and(eq(smStaffs.schoolId, schoolId), eq(smStaffs.activeStatus, 1)))
      .limit(500),
  ]);

  const classes: ClassOption[] = classRows
    .filter((row) => row.classId !== null && row.sectionId !== null)
    .map((row) => ({
      classId: row.classId as number,
      className: row.className,
      sectionId: row.sectionId as number,
      sectionName: row.sectionName,
    }));

  const conflicts = mapConflictRows(conflictRows);

  return json({
    enabled,
    subjects,
    classes,
    conflicts,
    offeringCount: conflicts.length,
    teachers,
  });
};
