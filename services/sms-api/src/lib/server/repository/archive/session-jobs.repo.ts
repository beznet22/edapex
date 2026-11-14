import { and, desc, eq, or } from "drizzle-orm";

import { sessionJobs } from "../../db/schema";
import { withErrorHandling } from "../base/error-handling";
import type { ScopedRepositoryContext } from "../base/repository-context";

export type SessionJobRow = typeof sessionJobs.$inferSelect;
export type SessionJobKind = SessionJobRow["kind"];
export type SessionJobStatus = SessionJobRow["status"];
export type NewSessionJob = typeof sessionJobs.$inferInsert;

const scoped = (ctx: ScopedRepositoryContext) => eq(sessionJobs.schoolId, ctx.tenant.schoolId);

export async function insertSessionJob(
  ctx: ScopedRepositoryContext,
  row: NewSessionJob
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db.insert(sessionJobs).values(row);
  }, "insertSessionJob");
}

export async function findSessionJob(
  ctx: ScopedRepositoryContext,
  id: string
): Promise<SessionJobRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(sessionJobs)
      .where(and(eq(sessionJobs.id, id), scoped(ctx)))
      .limit(1);
    return row ?? null;
  }, "findSessionJob");
}

export async function listSessionJobs(
  ctx: ScopedRepositoryContext,
  params: {
    readonly kind?: SessionJobKind;
    readonly status?: SessionJobStatus;
    readonly limit: number;
  }
): Promise<readonly SessionJobRow[]> {
  return withErrorHandling(async () => {
    const filters = [
      scoped(ctx),
      params.kind === undefined ? undefined : eq(sessionJobs.kind, params.kind),
      params.status === undefined ? undefined : eq(sessionJobs.status, params.status)
    ];
    return ctx.db
      .select()
      .from(sessionJobs)
      .where(and(...filters))
      .orderBy(desc(sessionJobs.createdAt))
      .limit(params.limit);
  }, "listSessionJobs");
}

export async function updateSessionJobProgress(
  ctx: ScopedRepositoryContext,
  id: string,
  params: {
    readonly progressJson?: string;
    readonly status?: SessionJobStatus;
    readonly error?: string | null;
    readonly updatedAt: number;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(sessionJobs)
      .set({
        ...(params.progressJson === undefined ? {} : { progressJson: params.progressJson }),
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.error === undefined ? {} : { error: params.error }),
        updatedAt: params.updatedAt
      })
      .where(and(eq(sessionJobs.id, id), scoped(ctx)));
  }, "updateSessionJobProgress");
}

export async function finishSessionJob(
  ctx: ScopedRepositoryContext,
  id: string,
  params: {
    readonly status: SessionJobStatus;
    readonly resultJson?: string | null;
    readonly progressJson?: string | null;
    readonly error?: string | null;
    readonly finishedAt: number;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(sessionJobs)
      .set({
        status: params.status,
        ...(params.resultJson === undefined ? {} : { resultJson: params.resultJson }),
        ...(params.progressJson === undefined ? {} : { progressJson: params.progressJson }),
        ...(params.error === undefined ? {} : { error: params.error }),
        updatedAt: params.finishedAt,
        finishedAt: params.finishedAt
      })
      .where(and(eq(sessionJobs.id, id), scoped(ctx)));
  }, "finishSessionJob");
}

export async function setSessionJobApproval(
  ctx: ScopedRepositoryContext,
  id: string,
  params: {
    readonly approvedBy: number;
    readonly tokenHash: string;
    readonly expiresAt: number;
    readonly updatedAt: number;
  }
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(sessionJobs)
      .set({
        approvedBy: params.approvedBy,
        approvalTokenHash: params.tokenHash,
        approvalExpiresAt: params.expiresAt,
        status: "awaiting_approval",
        updatedAt: params.updatedAt
      })
      .where(and(eq(sessionJobs.id, id), scoped(ctx)));
  }, "setSessionJobApproval");
}

export async function consumeSessionJobApproval(
  ctx: ScopedRepositoryContext,
  id: string,
  consumedAt: number
): Promise<void> {
  await withErrorHandling(async () => {
    await ctx.db
      .update(sessionJobs)
      .set({ approvalConsumedAt: consumedAt, updatedAt: consumedAt })
      .where(and(eq(sessionJobs.id, id), scoped(ctx)));
  }, "consumeSessionJobApproval");
}

export async function findRunningRestoreJob(
  ctx: ScopedRepositoryContext
): Promise<SessionJobRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(sessionJobs)
      .where(
        and(
          scoped(ctx),
          eq(sessionJobs.kind, "restore"),
          or(eq(sessionJobs.status, "running"), eq(sessionJobs.status, "queued"))
        )
      )
      .limit(1);
    return row ?? null;
  }, "findRunningRestoreJob");
}

export async function findActiveJobForSession(
  ctx: ScopedRepositoryContext,
  params: {
    readonly academicId: number;
    readonly kinds: readonly SessionJobKind[];
  }
): Promise<SessionJobRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(sessionJobs)
      .where(
        and(
          scoped(ctx),
          eq(sessionJobs.academicId, params.academicId),
          or(...params.kinds.map((kind) => eq(sessionJobs.kind, kind))),
          or(
            eq(sessionJobs.status, "queued"),
            eq(sessionJobs.status, "running"),
            eq(sessionJobs.status, "awaiting_approval")
          )
        )
      )
      .limit(1);
    return row ?? null;
  }, "findActiveJobForSession");
}

export async function findActiveWipeJob(
  ctx: ScopedRepositoryContext
): Promise<SessionJobRow | null> {
  return withErrorHandling(async () => {
    const [row] = await ctx.db
      .select()
      .from(sessionJobs)
      .where(
        and(
          scoped(ctx),
          eq(sessionJobs.kind, "wipe"),
          or(
            eq(sessionJobs.status, "queued"),
            eq(sessionJobs.status, "running"),
            eq(sessionJobs.status, "awaiting_approval")
          )
        )
      )
      .limit(1);
    return row ?? null;
  }, "findActiveWipeJob");
}
