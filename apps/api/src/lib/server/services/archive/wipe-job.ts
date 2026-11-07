import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import { emitAuthEvent } from "../auth/auth-events";
import type { SessionJobView } from "./job-progress";
import {
  encodeProgress,
  initialProgress,
  parseJobPayload,
  parseProgress,
  toSessionJobView
} from "./job-progress";
import type { ArchiveJobProgress } from "./job-progress";

const WIPE_SLICE = 100;

export async function runWipeSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<SessionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const job = await ctx.repos.archive.findSessionJob(scoped, jobId);
  if (job === null) throw new NotFoundError("Session job", jobId);
  if (job.kind !== "wipe") throw new ConflictError("This job is not a wipe job");
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return toSessionJobView(job);
  }
  const payload = parseJobPayload(job.payloadJson);
  if (payload === null) throw new ConflictError("Wipe job payload is missing its sessions");
  if (payload.sessionIds.length === 0) {
    throw new ConflictError("Wipe job has no sessions");
  }

  const now = ctx.ports.clock.now();
  if (job.status === "queued" || job.status === "awaiting_approval") {
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      status: "running",
      updatedAt: now
    });
  }

  let current: ArchiveJobProgress = parseProgress(job.progressJson) ?? initialProgress("wipe", 0);
  const page = await ctx.repos.archive.listArchiveObjectsForSessionsPage(scoped, {
    academicIds: payload.sessionIds,
    afterId: current.lastObjectId,
    limit: WIPE_SLICE
  });

  for (const object of page) {
    await ctx.ports.archiveStore.delete(object.objectKey);
  }
  if (page.length > 0) {
    await ctx.repos.archive.deleteArchiveObjectsByIds(
      scoped,
      page.map((object) => object.id)
    );
    const last = page[page.length - 1];
    current = {
      ...current,
      lastObjectId: last?.id ?? current.lastObjectId,
      objectsWritten: current.objectsWritten + page.length,
      deletedRows: {
        ...current.deletedRows,
        objects: (current.deletedRows.objects ?? 0) + page.length
      }
    };
  }

  if (page.length === WIPE_SLICE) {
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      progressJson: encodeProgress(current),
      updatedAt: ctx.ports.clock.now()
    });
    return toSessionJobView({ ...job, status: "running", progressJson: encodeProgress(current) });
  }

  let summaries = 0;
  for (const sessionId of payload.sessionIds) {
    summaries += await ctx.repos.archive.countSessionSummariesForSession(scoped, sessionId);
  }
  await ctx.repos.archive.deleteSessionSummariesForSessions(scoped, payload.sessionIds);
  const finishedAt = ctx.ports.clock.now();
  await emitAuthEvent(
    ctx,
    {
      type: "archive_wipe",
      userId: job.approvedBy ?? job.createdBy,
      metadata: {
        jobId,
        sessionIds: payload.sessionIds.join(","),
        objects: current.objectsWritten,
        summaries,
        approvedBy: job.approvedBy ?? 0
      }
    },
    finishedAt
  );

  const resultJson = JSON.stringify({ counts: { ...current.deletedRows, summaries }, gaps: 0 });
  await ctx.repos.archive.finishSessionJob(scoped, jobId, {
    status: "completed",
    progressJson: encodeProgress(current),
    resultJson,
    finishedAt
  });
  return toSessionJobView({
    ...job,
    status: "completed",
    progressJson: encodeProgress(current),
    resultJson,
    updatedAt: finishedAt,
    finishedAt
  });
}
