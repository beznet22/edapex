import { signPayload } from "../crypto/signed-payload";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { JobStateError, NotFoundError, PortError, WipeApprovalError } from "../errors";
import { sha256BytesHex } from "./archive-object";
import { runJobSlice } from "./job-runner";
import type { JobSliceView } from "./job-runner";
import type { SessionJobView } from "./job-progress";
import {
  parseProgress,
  toSessionJobView,
  WIPE_APPROVAL_TTL_SECONDS
} from "./job-progress";

export type JobKindFilter =
  | "bootstrap"
  | "archive"
  | "restore"
  | "promotion"
  | "wipe";

export type JobStatusFilter =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "awaiting_approval";

export interface JobListInput {
  readonly kind?: JobKindFilter;
  readonly status?: JobStatusFilter;
  readonly limit?: number;
}

export interface JobApproval {
  readonly token: string;
  readonly expiresAt: number;
}

export class JobService {
  constructor(private readonly ctx: ServiceContext) {}

  async list(input: JobListInput = {}): Promise<readonly SessionJobView[]> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const rows = await this.ctx.repos.archive.listSessionJobs(scoped, {
      ...(input.kind === undefined ? {} : { kind: input.kind }),
      ...(input.status === undefined ? {} : { status: input.status }),
      limit: input.limit ?? 50
    });
    return rows.map(toSessionJobView);
  }

  async resume(jobId: string): Promise<JobSliceView> {
    return runJobSlice(this.ctx, jobId);
  }

  async cancel(jobId: string): Promise<SessionJobView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const job = await this.ctx.repos.archive.findSessionJob(scoped, jobId);
    if (job === null) throw new NotFoundError("Session job", jobId);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      throw new JobStateError("This job has already finished");
    }
    if (job.kind === "wipe" && job.status === "running") {
      throw new JobStateError("A wipe that has started deleting cannot be cancelled");
    }
    const progress = parseProgress(job.progressJson);
    if (progress !== null && (progress.phase === "purge" || progress.phase === "wipe")) {
      throw new JobStateError("The destructive phase has already started");
    }
    const finishedAt = this.ctx.ports.clock.now();
    await this.ctx.repos.archive.finishSessionJob(scoped, jobId, {
      status: "cancelled",
      finishedAt
    });
    return toSessionJobView({
      ...job,
      status: "cancelled",
      updatedAt: finishedAt,
      finishedAt
    });
  }

  async approve(jobId: string, actorId: number): Promise<JobApproval> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const job = await this.ctx.repos.archive.findSessionJob(scoped, jobId);
    if (job === null) throw new NotFoundError("Session job", jobId);
    if (job.kind !== "wipe") {
      throw new JobStateError("Only a wipe job requires a second-admin approval");
    }
    if (job.status !== "awaiting_approval") {
      throw new JobStateError("This job is not awaiting approval");
    }
    if (job.createdBy === actorId) {
      throw new WipeApprovalError("A different administrator must approve the wipe");
    }
    if (job.approvalConsumedAt !== null) {
      throw new WipeApprovalError("This approval has already been consumed");
    }
    const secret = this.ctx.tokenSecret;
    if (secret === null) {
      throw new PortError("archive", "ARCHIVE_TOKEN_SECRET is not configured", false);
    }
    const now = this.ctx.ports.clock.now();
    const expiresAt = now + WIPE_APPROVAL_TTL_SECONDS;
    const token = await signPayload(secret, { jobId, approvedBy: actorId }, expiresAt);
    const tokenHash = await sha256BytesHex(new TextEncoder().encode(token));
    await this.ctx.repos.archive.setSessionJobApproval(scoped, jobId, {
      approvedBy: actorId,
      tokenHash,
      expiresAt,
      updatedAt: now
    });
    return { token, expiresAt };
  }
}
