import { and, eq, sql } from "drizzle-orm";
import { getDatabase } from "$lib/server/db";
import { smAcademicYears, smAssignSubjects } from "$lib/server/db/sms-schema";
import { isAdminOrIt, shouldRedirectToPeople } from "$lib/server/people/people-access";
import type { AuthUser } from "$lib/types/auth-types";

/**
 * Active academic year for the bootstrap redirect.
 *
 * Mirrors `BaseRepository.findActiveAcademicYear` (newest year whose date range
 * contains today, else the newest `active_status = 1` row) but returns `null`
 * instead of throwing when the school has none — `/people` must still render in
 * that state, and a missing year redirects nobody.
 */
export async function resolveActiveAcademicIdForRedirect(
  schoolId: number
): Promise<number | null> {
  const db = await getDatabase();
  const years = await db
    .select({
      id: smAcademicYears.id,
      activeStatus: smAcademicYears.activeStatus,
      startingDate: smAcademicYears.startingDate,
      endingDate: smAcademicYears.endingDate,
    })
    .from(smAcademicYears)
    .where(eq(smAcademicYears.schoolId, schoolId))
    .orderBy(smAcademicYears.id);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const newestFirst = [...years].sort((a, b) => b.id - a.id);
  for (const year of newestFirst) {
    if (!year.startingDate || !year.endingDate) continue;
    const start = new Date(year.startingDate);
    const end = new Date(year.endingDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (today >= start && today <= end) return year.id;
  }
  return newestFirst.find((year) => year.activeStatus === 1)?.id ?? null;
}

/** One indexed lookup on `teacher_id` for the caller's active assignments. */
export async function countActiveAssignments(
  schoolId: number,
  academicId: number,
  staffId: number
): Promise<number> {
  const db = await getDatabase();
  const [row] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(smAssignSubjects)
    .where(
      and(
        eq(smAssignSubjects.teacherId, staffId),
        eq(smAssignSubjects.schoolId, schoolId),
        eq(smAssignSubjects.academicId, academicId),
        eq(smAssignSubjects.activeStatus, 1)
      )
    );
  return Number(row?.total ?? 0);
}

export type BootstrapDecision = {
  isUnassigned: boolean;
  redirectToPeople: boolean;
  hasActiveYear: boolean;
};

/**
 * Decide the unassigned bootstrap for the current request.
 *
 * `/people` is the bootstrap surface: it is never redirected (loop
 * prevention), admins/IT are never redirected (they may legitimately hold no
 * assignment), non-staff are never redirected (`/people` returns 403 for them)
 * and a school without an active year redirects nobody. The decision comes from
 * `sm_assign_subjects`, never from the `selected-class` cookie.
 */
export async function resolveBootstrapDecision(input: {
  user: AuthUser;
  pathname: string;
}): Promise<BootstrapDecision> {
  const { user, pathname } = input;
  const staffId =
    typeof user.staffId === "number" && user.staffId > 0 ? user.staffId : null;
  const admin = isAdminOrIt(user);

  if (!staffId || admin) {
    return { isUnassigned: false, redirectToPeople: false, hasActiveYear: true };
  }

  const schoolId = user.schoolId ?? 1;
  const academicId = await resolveActiveAcademicIdForRedirect(schoolId);
  if (academicId === null) {
    return { isUnassigned: false, redirectToPeople: false, hasActiveYear: false };
  }

  const activeAssignments = await countActiveAssignments(schoolId, academicId, staffId);
  return {
    isUnassigned: activeAssignments === 0,
    redirectToPeople: shouldRedirectToPeople({
      pathname,
      staffId,
      isAdminOrIt: false,
      hasActiveAssignments: activeAssignments > 0,
      hasActiveYear: true,
    }),
    hasActiveYear: true,
  };
}
