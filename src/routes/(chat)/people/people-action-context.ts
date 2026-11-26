import { fail } from "@sveltejs/kit";
import { getDatabase } from "$lib/server/db";
import { smStaffs } from "$lib/server/db/sms-schema";
import { and, eq } from "drizzle-orm";
import { ScopedRepositoryProvider } from "$lib/server/mastra/scoped-repository";
import { createTenantContext } from "$lib/server/mastra/tenant-context";
import { ResultsRepository } from "$lib/server/repository/result.repo";
import { isAdminOrIt } from "$lib/server/people/people-access";
import type { AuthUser } from "$lib/types/auth-types";

export type ActionSuccess = { ok: true };

export function actionFailure(result: ActionFailure) {
  return fail(result.status, { error: result.error });
}
export type ActionFailure = { ok: false; status: number; error: string };
export type ActionResult = ActionSuccess | ActionFailure;

export type ActionContext = {
  user: AuthUser;
  schoolId: number;
  provider: ScopedRepositoryProvider;
};

export function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

export function formNumber(form: FormData, key: string): number {
  const value = Number(formString(form, key));
  return Number.isInteger(value) ? value : 0;
}

export async function requireManager(
  user: AuthUser | null | undefined
): Promise<ActionContext | null> {
  if (!user || !isAdminOrIt(user)) return null;
  const schoolId = user.schoolId ?? 1;
  const db = await getDatabase();
  const provider = new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );
  return { user, schoolId, provider };
}

/** Resolve the active academic year, or null when the school has none. */
export async function resolveAcademicId(
  provider: ScopedRepositoryProvider
): Promise<number | null> {
  const year = await provider.getRepo(ResultsRepository).getActiveAcademicYear();
  return year?.id ?? null;
}

/** True when the class/section is an active school class for the year. */
export async function isActiveClass(
  provider: ScopedRepositoryProvider,
  schoolId: number,
  academicId: number,
  classId: number,
  sectionId: number
): Promise<boolean> {
  const classes = await provider
    .getRepo(ResultsRepository)
    .getClassSections({ schoolId, academicId });
  return classes.some(
    (row) => row.classId === classId && row.sectionId === sectionId
  );
}

export async function ownsStaffRow(
  schoolId: number,
  staffId: number
): Promise<boolean> {
  const db = await getDatabase();
  const [row] = await db
    .select({ id: smStaffs.id })
    .from(smStaffs)
    .where(and(eq(smStaffs.id, staffId), eq(smStaffs.schoolId, schoolId)))
    .limit(1);
  return row !== undefined;
}

export async function ownsActiveTeacher(
  schoolId: number,
  teacherId: number
): Promise<boolean> {
  const db = await getDatabase();
  const [row] = await db
    .select({ id: smStaffs.id, activeStatus: smStaffs.activeStatus })
    .from(smStaffs)
    .where(and(eq(smStaffs.id, teacherId), eq(smStaffs.schoolId, schoolId)))
    .limit(1);
  return row !== undefined && row.activeStatus === 1;
}

/** Per-request provider for the caller, used by non-manager actions. */
export async function staffProvider(
  user: AuthUser,
  schoolId: number
): Promise<ScopedRepositoryProvider> {
  const db = await getDatabase();
  return new ScopedRepositoryProvider(
    db,
    createTenantContext({ schoolId, userId: user.id, staffId: user.staffId })
  );
}
