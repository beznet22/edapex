import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import { runArchiveSlice } from "./archive-job";
import { runRestoreSlice } from "./restore-job";
import { runWipeSlice } from "./wipe-job";
import type { SessionJobView } from "./job-progress";

/**
 * Dispatches one bounded job slice. Restore and wipe branches land with their
 * services; until then they refuse explicitly rather than silently no-op.
 */
export async function runJobSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<SessionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const job = await ctx.repos.archive.findSessionJob(scoped, jobId);
  if (job === null) throw new NotFoundError("Session job", jobId);
  switch (job.kind) {
    case "archive":
      return runArchiveSlice(ctx, jobId);
    case "restore":
      return runRestoreSlice(ctx, jobId);
    case "wipe":
      return runWipeSlice(ctx, jobId);
    case "promotion":
    case "bootstrap":
      throw new ConflictError(`A ${job.kind} job is not runnable yet`);
  }
}
