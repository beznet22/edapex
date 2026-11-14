import { and, eq } from "drizzle-orm";

import { smStudentCategories } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";
import type { ReferenceOption } from "./types";

export async function listStudentCategories(
  ctx: ScopedRepositoryContext
): Promise<readonly ReferenceOption[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select({ id: smStudentCategories.id, name: smStudentCategories.categoryName })
        .from(smStudentCategories)
        .where(eq(smStudentCategories.schoolId, ctx.tenant.schoolId))
        .orderBy(smStudentCategories.id),
    "listStudentCategories"
  );
}

export async function resolveStudentCategoryId(
  ctx: ScopedRepositoryContext,
  name: string
): Promise<number | null> {
  if (name.length === 0) return null;
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select({ id: smStudentCategories.id })
      .from(smStudentCategories)
      .where(
        and(
          eq(smStudentCategories.schoolId, ctx.tenant.schoolId),
          eq(smStudentCategories.categoryName, name)
        )
      )
      .limit(1);
    return row?.id ?? null;
  }, "resolveStudentCategoryId");
}
