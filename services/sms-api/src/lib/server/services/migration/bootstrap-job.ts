import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { NotFoundError } from "../errors";
import type {
  BootstrapJobPayload,
  BootstrapJobView,
  BootstrapProgress,
  BootstrapResult
} from "./bootstrap-input";
import {
  bootstrapJobPayloadSchema,
  bootstrapProgressSchema,
  bootstrapResultSchema,
  initialBootstrapProgress
} from "./bootstrap-input";
import { readIntegrityReport } from "./integrity-gate";
import { runStep } from "./bootstrap-steps";

type JobRow = Awaited<ReturnType<ServiceContext["repos"]["archive"]["findSessionJob"]>>;

function parseProgress(json: string | null): BootstrapProgress | null {
  if (json === null) return null;
  try {
    const parsed = bootstrapProgressSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function parseResult(json: string | null): BootstrapResult | null {
  if (json === null) return null;
  try {
    const parsed = bootstrapResultSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function view(
  job: NonNullable<JobRow>,
  progress: BootstrapProgress | null,
  result: BootstrapResult | null
): BootstrapJobView {
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

export async function runBootstrapSlice(
  ctx: ServiceContext,
  jobId: string
): Promise<BootstrapJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const job = await ctx.repos.archive.findSessionJob(scoped, jobId);
  if (job === null) throw new NotFoundError("Bootstrap job", jobId);
  if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
    return view(job, parseProgress(job.progressJson), parseResult(job.resultJson));
  }

  let payload: BootstrapJobPayload;
  try {
    payload = bootstrapJobPayloadSchema.parse(JSON.parse(job.payloadJson ?? "{}"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(ctx, job, null, `Invalid bootstrap payload: ${message}`);
  }

  const progress = parseProgress(job.progressJson) ?? initialBootstrapProgress();
  if (progress.step >= progress.steps.length) {
    return complete(ctx, job, progress, payload);
  }

  try {
    const next = await runStep(ctx, payload, progress);
    const timestamp = ctx.ports.clock.now();
    await ctx.repos.archive.updateSessionJobProgress(scoped, jobId, {
      status: "running",
      progressJson: JSON.stringify(next),
      updatedAt: timestamp
    });
    if (next.step >= next.steps.length) {
      return complete(ctx, job, next, payload);
    }
    return view(
      { ...job, status: "running", progressJson: JSON.stringify(next), updatedAt: timestamp },
      next,
      null
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(ctx, job, progress, message);
  }
}

async function fail(
  ctx: ServiceContext,
  job: NonNullable<JobRow>,
  progress: BootstrapProgress | null,
  message: string
): Promise<BootstrapJobView> {
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
  progress: BootstrapProgress,
  payload: BootstrapJobPayload
): Promise<BootstrapJobView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  const readiness = (await readIntegrityReport(ctx, payload.input.newSession.id)).readiness;
  const result: BootstrapResult = {
    sessionId: payload.input.newSession.id,
    counts: progress.counts,
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
