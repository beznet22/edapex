import { z } from "zod";

import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError, PortError, WipeApprovalError } from "../errors";
import { sha256BytesHex } from "./archive-object";
import type { SessionJobView } from "./job-progress";
import { parseJobPayload } from "./job-progress";
import { runWipeSlice } from "./wipe-job";
import { verifyPayload } from "../crypto/signed-payload";

export const WIPE_CONFIRMATION = "WIPE_ALL_ARCHIVES" as const;

const approvalPayloadSchema = z.object({
  jobId: z.string().min(1),
  approvedBy: z.number().int().positive()
});
type WipeApprovalPayload = z.infer<typeof approvalPayloadSchema>;

const isWipeApproval = (value: unknown): value is WipeApprovalPayload =>
  approvalPayloadSchema.safeParse(value).success;

export interface WipeRequestInput {
  readonly sessionIds: readonly number[];
  readonly actorId: number;
}

export interface WipeRequestView {
  readonly jobId: string;
  readonly sessionIds: readonly number[];
  readonly objects: number;
  readonly bytes: number;
  readonly summaries: number;
  readonly approvalExpiresAt: number | null;
}

export interface WipeExecuteInput {
  readonly sessionIds: readonly number[];
  readonly confirm: string;
  readonly secondAdminToken: string;
  readonly actorId: number;
}

export class WipeService {
  constructor(private readonly ctx: ServiceContext) {}

  async request(input: WipeRequestInput): Promise<WipeRequestView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const sessionIds = [...new Set(input.sessionIds)];
    if (sessionIds.length === 0) {
      throw new ConflictError("Select at least one session to wipe");
    }
    for (const sessionId of sessionIds) {
      const year = await this.ctx.repos.school.selectAcademicYearById(scoped, sessionId);
      if (year === null) throw new NotFoundError("Academic year", sessionId);
    }
    if ((await this.ctx.repos.archive.findRunningRestoreJob(scoped)) !== null) {
      throw new ConflictError("A restore is running; wipe is blocked");
    }
    if ((await this.ctx.repos.archive.findActiveWipeJob(scoped)) !== null) {
      throw new ConflictError("A wipe job is already awaiting approval");
    }

    const objects = await this.ctx.repos.archive.listArchiveObjectsBySessions(scoped, sessionIds);
    let summaries = 0;
    for (const sessionId of sessionIds) {
      summaries += await this.ctx.repos.archive.countSessionSummariesForSession(scoped, sessionId);
    }
    const jobId = crypto.randomUUID();
    await this.ctx.repos.archive.insertSessionJob(scoped, {
      id: jobId,
      schoolId: scoped.tenant.schoolId,
      kind: "wipe",
      academicId: null,
      status: "awaiting_approval",
      payloadJson: JSON.stringify({ sessionIds, purge: false, dryRun: true }),
      createdBy: input.actorId,
      createdAt: this.ctx.ports.clock.now()
    });
    return {
      jobId,
      sessionIds,
      objects: objects.length,
      bytes: objects.reduce((sum, object) => sum + object.bytes, 0),
      summaries,
      approvalExpiresAt: null
    };
  }

  async execute(input: WipeExecuteInput): Promise<SessionJobView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    if (input.confirm !== WIPE_CONFIRMATION) {
      throw new WipeApprovalError(`Type ${WIPE_CONFIRMATION} to confirm the wipe`);
    }
    if ((await this.ctx.repos.archive.findRunningRestoreJob(scoped)) !== null) {
      throw new ConflictError("A restore is running; wipe is blocked");
    }
    const secret = this.ctx.tokenSecret;
    if (secret === null) {
      throw new PortError("archive", "ARCHIVE_TOKEN_SECRET is not configured", false);
    }
    const now = this.ctx.ports.clock.now();
    const approval = await verifyPayload(secret, input.secondAdminToken, isWipeApproval, now);
    if (approval === null) throw new WipeApprovalError("The approval token is invalid or expired");

    const job = await this.ctx.repos.archive.findSessionJob(scoped, approval.jobId);
    if (job === null || job.kind !== "wipe") {
      throw new WipeApprovalError("The approval token does not belong to a wipe job");
    }
    if (job.approvedBy !== approval.approvedBy) {
      throw new WipeApprovalError("The approval actor does not match the job");
    }
    if (job.createdBy === input.actorId) {
      throw new WipeApprovalError("The initiating administrator cannot execute the wipe");
    }
    if (job.approvalConsumedAt !== null) {
      throw new WipeApprovalError("This approval token has already been used");
    }
    if (job.approvalExpiresAt === null || job.approvalExpiresAt < now) {
      throw new WipeApprovalError("The approval token has expired");
    }
    const tokenHash = await sha256BytesHex(new TextEncoder().encode(input.secondAdminToken));
    if (job.approvalTokenHash !== tokenHash) {
      throw new WipeApprovalError("The approval token does not match this job");
    }
    const payload = parseJobPayload(job.payloadJson);
    if (payload === null) {
      throw new WipeApprovalError("The wipe job has no approved session set");
    }
    const requested = [...new Set(input.sessionIds)].sort((a, b) => a - b);
    const approved = [...payload.sessionIds].sort((a, b) => a - b);
    if (requested.join(",") !== approved.join(",")) {
      throw new WipeApprovalError("The token was approved for a different session set");
    }

    await this.ctx.repos.archive.consumeSessionJobApproval(scoped, job.id, now);
    let view = await runWipeSlice(this.ctx, job.id);
    for (let slice = 0; slice < 10 && view.status === "running"; slice += 1) {
      view = await runWipeSlice(this.ctx, job.id);
    }
    return view;
  }
}
