import { and, eq } from "drizzle-orm";

import { publishApprovals } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export interface PublishApprovalRow {
  readonly id: number;
  readonly examId: number;
  readonly requestedBy: number;
  readonly studentIdsJson: string;
  readonly status: "pending" | "approved" | "denied";
}

export async function createApproval(
  ctx: ScopedRepositoryContext,
  input: {
    readonly examId: number;
    readonly requestedBy: number;
    readonly studentIds: readonly number[];
    readonly note: string | null;
  },
  now: number
): Promise<number> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .insert(publishApprovals)
      .values({
        schoolId: ctx.tenant.schoolId,
        examId: input.examId,
        requestedBy: input.requestedBy,
        studentIdsJson: JSON.stringify(input.studentIds),
        status: "pending",
        note: input.note,
        createdAt: now
      })
      .returning({ id: publishApprovals.id });
    const row = rows[0];
    if (row === undefined) throw new Error("createApproval returned no row");
    return row.id;
  }, "createApproval");
}

export async function listPending(
  ctx: ScopedRepositoryContext
): Promise<readonly PublishApprovalRow[]> {
  return withErrorHandling(async () => {
    return ctx.db
      .select({
        id: publishApprovals.id,
        examId: publishApprovals.examId,
        requestedBy: publishApprovals.requestedBy,
        studentIdsJson: publishApprovals.studentIdsJson,
        status: publishApprovals.status
      })
      .from(publishApprovals)
      .where(
        and(
          eq(publishApprovals.schoolId, ctx.tenant.schoolId),
          eq(publishApprovals.status, "pending")
        )
      );
  }, "listPending");
}

/**
 * Decide a pending request, and only a pending one.
 *
 * The `status = 'pending'` in the WHERE is the whole safety story: two admins
 * deciding at once produce one decision and one publish, not two of each.
 */
export async function decide(
  ctx: ScopedRepositoryContext,
  id: number,
  adminUserId: number,
  decision: "approved" | "denied",
  note: string | null,
  now: number
): Promise<PublishApprovalRow | null> {
  return withErrorHandling(async () => {
    const rows = await ctx.db
      .update(publishApprovals)
      .set({ status: decision, decidedBy: adminUserId, decidedAt: now, note })
      .where(
        and(
          eq(publishApprovals.id, id),
          eq(publishApprovals.schoolId, ctx.tenant.schoolId),
          eq(publishApprovals.status, "pending")
        )
      )
      .returning({
        id: publishApprovals.id,
        examId: publishApprovals.examId,
        requestedBy: publishApprovals.requestedBy,
        studentIdsJson: publishApprovals.studentIdsJson,
        status: publishApprovals.status
      });
    return rows[0] ?? null;
  }, "decideApproval");
}
