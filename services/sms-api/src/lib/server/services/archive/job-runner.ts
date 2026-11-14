import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError } from "../errors";
import { runArchiveSlice } from "./archive-job";
import { runRestoreSlice } from "./restore-job";
import { runWipeSlice } from "./wipe-job";
import type { SessionJobView } from "./job-progress";
import { runBootstrapSlice } from "../migration/bootstrap-job";
import type { BootstrapJobView } from "../migration/bootstrap-input";
import { runPromotionSlice } from "../migration/promotion-job";
import type { PromotionJobView } from "../migration/promotion-input";

export type JobSliceView = SessionJobView | BootstrapJobView | PromotionJobView;

/**
 * Dispatches one bounded job slice. Promotion is wired in Chunk 5; until then
 * it refuses explicitly rather than silently no-op.
 */
export async function runJobSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<JobSliceView> {
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
    case "bootstrap":
      return runBootstrapSlice(ctx, jobId);
    case "promotion":
      return runPromotionSlice(ctx, jobId);
  }
}
