import { eq } from "drizzle-orm";

import { reportSettings } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type ReportSettingsRow = typeof reportSettings.$inferSelect;

export async function findReportSettings(
  ctx: ScopedRepositoryContext
): Promise<ReportSettingsRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(reportSettings)
      .where(eq(reportSettings.schoolId, ctx.tenant.schoolId))
      .limit(1);
    return row ?? null;
  }, "findReportSettings");
}

export async function upsertReportSettings(
  ctx: ScopedRepositoryContext,
  payload: string,
  updatedAt: number
): Promise<void> {
  await withErrorHandling(
    async () => {
      await ctx.db
        .insert(reportSettings)
        .values({ schoolId: ctx.tenant.schoolId, payload, updatedAt })
        .onConflictDoUpdate({
          target: reportSettings.schoolId,
          set: { payload, updatedAt }
        });
    },
    "upsertReportSettings"
  );
}
