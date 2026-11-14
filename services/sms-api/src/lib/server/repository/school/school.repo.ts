import { eq } from "drizzle-orm";

import { smSchools } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface SchoolInfo {
  readonly schoolName: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

/** Tenant-scoped school header used by report and receipt rendering. */
export async function findSchoolInfo(
  ctx: ScopedRepositoryContext
): Promise<SchoolInfo | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({
        schoolName: smSchools.schoolName,
        email: smSchools.email,
        phone: smSchools.phone
      })
      .from(smSchools)
      .where(eq(smSchools.id, ctx.tenant.schoolId))
      .limit(1);
    return row ?? null;
  }, "findSchoolInfo");
}
