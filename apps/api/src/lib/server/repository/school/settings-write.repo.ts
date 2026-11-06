import { eq } from "drizzle-orm";

import { smGeneralSettings } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

/** `id` and `schoolId` are never patchable through this repository. */
export type GeneralSettingsPatch = Partial<
  Omit<typeof smGeneralSettings.$inferInsert, "id" | "schoolId">
>;

/**
 * Updates only the supplied columns on the tenant's settings row. The service
 * owns the field whitelist; this function never constructs a patch.
 */
export async function updateGeneralSettings(
  ctx: ScopedRepositoryContext,
  patch: GeneralSettingsPatch
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  await withErrorHandling(
    async () => {
      await ctx.db
        .update(smGeneralSettings)
        .set(patch)
        .where(eq(smGeneralSettings.schoolId, ctx.tenant.schoolId));
    },
    "updateGeneralSettings"
  );
}
