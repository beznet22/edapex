import { eq } from "drizzle-orm";

import { smGeneralSettings } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import { generalSettingColumns } from "./columns";
import type { GeneralSetting } from "./columns";

/** Fresh read: the request-scoped cache lives in `academic-config.ts`. */
export async function selectGeneralSettings(
  ctx: ScopedRepositoryContext
): Promise<readonly GeneralSetting[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select(generalSettingColumns)
        .from(smGeneralSettings)
        .where(eq(smGeneralSettings.schoolId, ctx.tenant.schoolId))
        .orderBy(smGeneralSettings.id),
    "selectGeneralSettings"
  );
}

/**
 * The school id is explicit and must match the tenant; there is no default
 * school 1 fallback (`R5`).
 */
export async function selectGeneralSettingBySchoolId(
  ctx: ScopedRepositoryContext,
  schoolId: number
): Promise<GeneralSetting | null> {
  return withErrorHandling(async () => {
    if (schoolId !== ctx.tenant.schoolId) return null;
    const [row] = await ctx.db
      .select(generalSettingColumns)
      .from(smGeneralSettings)
      .where(eq(smGeneralSettings.schoolId, ctx.tenant.schoolId))
      .limit(1);
    return row ?? null;
  }, "selectGeneralSettingBySchoolId");
}
