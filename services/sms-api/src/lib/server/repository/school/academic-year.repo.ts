import { and, eq } from "drizzle-orm";

import { smAcademicYears } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { AcademicYearRow, ScopedRepositoryContext } from "../base/repository-context";

export async function selectAcademicYears(
  ctx: ScopedRepositoryContext
): Promise<readonly AcademicYearRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(smAcademicYears)
        .where(eq(smAcademicYears.schoolId, ctx.tenant.schoolId))
        .orderBy(smAcademicYears.id),
    "selectAcademicYears"
  );
}

export async function selectAcademicYearById(
  ctx: ScopedRepositoryContext,
  id: number
): Promise<AcademicYearRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(smAcademicYears)
      .where(eq(smAcademicYears.id, id))
      .limit(1);
    if (row === undefined || row.schoolId !== ctx.tenant.schoolId) return null;
    return row;
  }, "selectAcademicYearById");
}

export interface AcademicYearArchiveState {
  readonly status: AcademicYearRow["status"];
  readonly archivedAt?: number | null;
  readonly archiveManifestKey?: string | null;
}

/** The archive state machine lives on the session row (`06 §6.1`). */
export async function setAcademicYearArchiveState(
  ctx: ScopedRepositoryContext,
  id: number,
  state: AcademicYearArchiveState
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(smAcademicYears)
      .set({
        status: state.status,
        ...(state.archivedAt === undefined ? {} : { archivedAt: state.archivedAt }),
        ...(state.archiveManifestKey === undefined
          ? {}
          : { archiveManifestKey: state.archiveManifestKey })
      })
      .where(and(eq(smAcademicYears.id, id), eq(smAcademicYears.schoolId, ctx.tenant.schoolId)));
  }, "setAcademicYearArchiveState");
}
