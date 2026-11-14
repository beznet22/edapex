import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError } from "../errors";
import {
  initialPromotionProgress,
  promotionJobPayloadSchema,
  promotionProgressSchema,
  promotionResultSchema
} from "./promotion-input";
import type {
  PromotionJobPayload,
  PromotionJobView,
  PromotionProgress,
  PromotionResult
} from "./promotion-input";
import { buildPromotionPlan } from "./promotion-plan";
import { processBatch, processCarryForward } from "./promotion-batch";
import { readIntegrityReport } from "./integrity-gate";

type JobRow = Awaited<ReturnType<ServiceContext["repos"]["archive"]["findSessionJob"]>>;

function parseProgress(json: string | null): PromotionProgress | null {
  if (json === null) return null;
  try {
    const parsed = promotionProgressSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseResult(json: string | null): PromotionResult | null {
  if (json === null) return null;
  try {
    const parsed = promotionResultSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function view(
  job: NonNullable<JobRow>,
  progress: PromotionProgress | null,
  result: PromotionResult | null
): PromotionJobView {
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    academicId: job.academicId,
    progress,
    result,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt
  };
}

export async function runPromotionSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<PromotionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const job = await ctx.repos.archive.findSessionJob(scoped, jobId);
  if (job === null) throw new NotFoundError("Promotion job", jobId);
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return view(job, parseProgress(job.progressJson), parseResult(job.resultJson));
  }
  let payload: PromotionJobPayload;
  try {
    payload = promotionJobPayloadSchema.parse(JSON.parse(job.payloadJson ?? "{}"));
  } catch (error) {
    return fail(ctx, job, null, error instanceof Error ? error.message : String(error));
  }
  let progress = parseProgress(job.progressJson) ?? initialPromotionProgress();

  try {
    if (progress.counts.planned !== 1) {
      progress = await planStep(ctx, payload, progress);
    } else if (progress.batchIndex < progress.batchIds.length) {
      progress = await processBatch(ctx, payload, progress);
    } else if (
      payload.outcomeForMissing === "carry-forward" &&
      progress.carryForwardDone !== true &&
      progress.unplacedClassIds.length > 0
    ) {
      progress = await processCarryForward(ctx, payload, progress);
    } else {
      return complete(ctx, job, progress, payload);
    }
    const timestamp = ctx.ports.clock.now();
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      status: "running",
      progressJson: JSON.stringify(progress),
      updatedAt: timestamp
    });
    return view(
      { ...job, status: "running", progressJson: JSON.stringify(progress), updatedAt: timestamp },
      progress,
      null
    );
  } catch (error) {
    return fail(ctx, job, progress, error instanceof Error ? error.message : String(error));
  }
}

async function planStep(
  ctx: ServiceContext,
  payload: PromotionJobPayload,
  progress: PromotionProgress
): Promise<PromotionProgress> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const rows = await ctx.repos.profiles.countPlanByClass(scoped, payload.sourceAcademicId);
  const plan = buildPromotionPlan(rows);
  const noCurrentRecord = await ctx.repos.profiles.countStudentsWithoutCurrentRecord(
    scoped,
    payload.sourceAcademicId
  );
  const noClassUnplaced = await ctx.repos.profiles.countStudentsWithoutClassRecord(
    scoped,
    payload.sourceAcademicId
  );
  const existing = await ctx.repos.lifecycle.listBatches(scoped, payload.targetAcademicId);
  const batchIds: number[] = [];
  for (const batch of plan.batches) {
    const found = existing.find((row) => row.fromClassId === batch.classId);
    if (found !== undefined) {
      batchIds.push(found.id);
      continue;
    }
    batchIds.push(
      await ctx.repos.lifecycle.insertBatch(scoped, {
        schoolId: scoped.tenant.schoolId,
        academicId: payload.targetAcademicId,
        fromClassId: batch.classId,
        toClassId: batch.toClassId,
        studentCount: batch.studentCount
      })
    );
  }
  return {
    ...progress,
    batchIds,
    unplacedClassIds: plan.unplaced.map((row) => row.classId),
    counts: {
      ...progress.counts,
      planned: 1,
      planPromoted: plan.totals.promoted,
      planDaycare: plan.totals.daycare,
      planUnplaced: plan.totals.unplaced + noClassUnplaced,
      noCurrentRecord
    },
    notes: [...progress.notes, `planned ${batchIds.length} batches`]
  };
}

async function fail(
  ctx: ServiceContext,
  job: NonNullable<JobRow>,
  progress: PromotionProgress | null,
  message: string
): Promise<PromotionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const timestamp = ctx.ports.clock.now();
  await ctx.repos.archive.finishSessionJob(scoped, job.id, {
    status: "failed",
    error: message,
    progressJson: progress === null ? null : JSON.stringify(progress),
    finishedAt: timestamp
  });
  return view(
    { ...job, status: "failed", error: message, updatedAt: timestamp, finishedAt: timestamp },
    progress,
    null
  );
}

async function complete(
  ctx: ServiceContext,
  job: NonNullable<JobRow>,
  progress: PromotionProgress,
  payload: PromotionJobPayload
): Promise<PromotionJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const outcomes = await ctx.repos.lifecycle.countOutcomes(scoped, payload.targetAcademicId);
  const targetRecords = await ctx.repos.profiles.countTargetCurrentRecords(
    scoped,
    payload.targetAcademicId
  );
  const readiness = (await readIntegrityReport(ctx, payload.targetAcademicId)).readiness;
  const counts = {
    ...progress.counts,
    promoted: progress.counts.promoted ?? 0,
    daycare: progress.counts.daycare ?? 0,
    quarantined: outcomes.quarantined,
    graduated: outcomes.graduated,
    targetRecords,
    noCurrentRecord: progress.counts.noCurrentRecord ?? 0,
    unplaced: progress.counts.planUnplaced ?? 0
  };
  const result: PromotionResult = {
    targetAcademicId: payload.targetAcademicId,
    sourceAcademicId: payload.sourceAcademicId,
    counts,
    readiness
  };
  const timestamp = ctx.ports.clock.now();
  await ctx.repos.archive.finishSessionJob(scoped, job.id, {
    status: "completed",
    resultJson: JSON.stringify(result),
    progressJson: JSON.stringify(progress),
    error: null,
    finishedAt: timestamp
  });
  return view(
    {
      ...job,
      status: "completed",
      resultJson: JSON.stringify(result),
      progressJson: JSON.stringify(progress),
      updatedAt: timestamp,
      finishedAt: timestamp
    },
    progress,
    result
  );
}
