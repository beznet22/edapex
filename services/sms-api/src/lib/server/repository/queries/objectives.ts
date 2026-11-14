import { and, eq } from "drizzle-orm";

import { smStudentCategories, smStudents } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface ObjectiveRow {
  readonly id: number;
  readonly name: string | null;
}

/**
 * The objectives table is not part of the port. The legacy method keeps a
 * NURSERY guard; this query module preserves that domain check while reading
 * the student aggregate, which the feedback repository may not touch.
 */
export async function findObjectives(
  ctx: ScopedRepositoryContext,
  studentId: number
): Promise<readonly ObjectiveRow[]> {
  return withErrorHandling(async () => {
    const [student] = await ctx.db
      .select({ categoryName: smStudentCategories.categoryName })
      .from(smStudents)
      .leftJoin(smStudentCategories, eq(smStudents.studentCategoryId, smStudentCategories.id))
      .where(and(eq(smStudents.id, studentId), eq(smStudents.schoolId, ctx.tenant.schoolId)))
      .limit(1);
    if (student?.categoryName === "NURSERY") return [];
    return [];
  }, "findObjectives");
}
