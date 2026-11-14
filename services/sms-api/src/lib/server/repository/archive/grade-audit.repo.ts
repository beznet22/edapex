import { and, desc, eq } from "drizzle-orm";

import { gradeChangeAudit } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type GradeAuditRow = typeof gradeChangeAudit.$inferSelect;
export type NewGradeAudit = typeof gradeChangeAudit.$inferInsert;

export async function insertGradeAudit(
  ctx: ScopedRepositoryContext,
  row: NewGradeAudit
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.insert(gradeChangeAudit).values(row);
  }, "insertGradeAudit");
}

export async function listGradeAuditForResult(
  ctx: ScopedRepositoryContext,
  resultId: number
): Promise<readonly GradeAuditRow[]> {
  return withErrorHandling(
    async () =>
      ctx.db
        .select()
        .from(gradeChangeAudit)
        .where(
          and(
            eq(gradeChangeAudit.schoolId, ctx.tenant.schoolId),
            eq(gradeChangeAudit.resultId, resultId)
          )
        )
        .orderBy(desc(gradeChangeAudit.createdAt)),
    "listGradeAuditForResult"
  );
}
