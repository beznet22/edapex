import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError, PermissionError } from "../errors";

export interface RetrievalActor {
  readonly userId: number;
  readonly isStaff: boolean;
}

/**
 * Staff may read any student in their school; a parent may read only their own
 * children (`06 §5.2`). The student lookup is tenant-scoped, so a foreign id is
 * a 404 rather than a cross-tenant read.
 */
export async function assertStudentReadable(
  ctx: ServiceContext,
  studentId: number,
  actor: RetrievalActor
): Promise<void> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const details = await ctx.repos.queries.findStudentDetails(scoped, studentId);
  if (details === null) throw new NotFoundError("Student", studentId);
  if (actor.isStaff) return;
  const parent = await ctx.repos.profiles.findParentByUserId(scoped, actor.userId);
  if (parent === null || details.parentId !== parent.parentId) {
    throw new PermissionError("You may only read your own children's documents");
  }
}
