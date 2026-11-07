import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import { parseOrThrow } from "../validation";
import {
  initialPromotionProgress,
  promotionBodySchema,
  promotionProgressSchema,
  promotionResultSchema,
  reverseBodySchema
} from "./promotion-input";
import type { PromotionJobView, PromotionProgress, PromotionResult } from "./promotion-input";
import { buildPromotionPlan } from "./promotion-plan";
import type { PromotionPlan } from "./promotion-plan";
import { groupQuarantine, quarantineCsv, quarantineDocument } from "./quarantine";
import type { QuarantineView } from "./quarantine";
import { runPromotionSlice } from "./promotion-job";

export interface PromotionDryRunView {
  readonly dryRun: true;
  readonly targetAcademicId: number;
  readonly sourceAcademicId: number;
  readonly batches: readonly {
    readonly fromClassId: number;
    readonly toClassId: number;
    readonly className: string;
    readonly studentCount: number;
    readonly daycare: boolean;
  }[];
  readonly unplaced: readonly { readonly classId: number; readonly className: string; readonly studentCount: number }[];
  readonly totals: PromotionPlan["totals"] & { readonly noCurrentRecord: number };
}

export type PromotionStartResult = PromotionJobView | PromotionDryRunView;

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

export class PromotionService {
  constructor(private readonly ctx: ServiceContext) {}

  private async sourceYear(targetAcademicId: number): Promise<number> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const years = await this.ctx.repos.school.selectAcademicYears(scoped);
    const source = [...years]
      .filter((year) => year.id < targetAcademicId)
      .sort((left, right) => right.id - left.id)[0];
    if (source === undefined) throw new NotFoundError("Source academic year", targetAcademicId - 1);
    return source.id;
  }

  private async plan(
    targetAcademicId: number
  ): Promise<{
    readonly sourceAcademicId: number;
    readonly plan: PromotionPlan;
    readonly noCurrentRecord: number;
    readonly noClassUnplaced: number;
  }> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const sourceAcademicId = await this.sourceYear(targetAcademicId);
    const rows = await this.ctx.repos.profiles.countPlanByClass(scoped, sourceAcademicId);
    const noCurrentRecord = await this.ctx.repos.profiles.countStudentsWithoutCurrentRecord(
      scoped,
      sourceAcademicId
    );
    const noClassUnplaced = await this.ctx.repos.profiles.countStudentsWithoutClassRecord(
      scoped,
      sourceAcademicId
    );
    return {
      sourceAcademicId,
      plan: buildPromotionPlan(rows),
      noCurrentRecord,
      noClassUnplaced
    };
  }

  async start(sessionId: number, input: unknown, actorId: number): Promise<PromotionStartResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => promotionBodySchema.parseAsync(input),
      "Promotion validation failed"
    );
    const year = await this.ctx.repos.school.selectAcademicYearById(scoped, sessionId);
    if (year === null) throw new NotFoundError("Academic year", sessionId);
    const { sourceAcademicId, plan, noCurrentRecord, noClassUnplaced } = await this.plan(sessionId);

    if (parsed.dryRun) {
      return {
        dryRun: true,
        targetAcademicId: sessionId,
        sourceAcademicId,
        batches: plan.batches.map((batch) => ({
          fromClassId: batch.classId,
          toClassId: batch.toClassId,
          className: batch.className,
          studentCount: batch.studentCount,
          daycare: batch.daycare
        })),
        unplaced: plan.unplaced.map((row) => ({
          classId: row.classId,
          className: row.className,
          studentCount: row.studentCount
        })),
        totals: {
          ...plan.totals,
          unplaced: plan.totals.unplaced + noClassUnplaced,
          noCurrentRecord
        }
      };
    }

    const jobId = `pr_${crypto.randomUUID()}`;
    await this.ctx.repos.archive.insertSessionJob(scoped, {
      id: jobId,
      schoolId: scoped.tenant.schoolId,
      kind: "promotion",
      academicId: sessionId,
      status: "queued",
      progressJson: JSON.stringify(initialPromotionProgress()),
      resultJson: null,
      payloadJson: JSON.stringify({
        targetAcademicId: sessionId,
        sourceAcademicId,
        actorId,
        outcomeForMissing: parsed.outcomeForMissing
      }),
      error: null,
      createdBy: actorId,
      createdAt: this.ctx.ports.clock.now()
    });
    return runPromotionSlice(this.ctx, jobId);
  }

  async status(jobId: string): Promise<PromotionJobView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const job = await this.ctx.repos.archive.findSessionJob(scoped, jobId);
    if (job === null) throw new NotFoundError("Promotion job", jobId);
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      academicId: job.academicId,
      progress: parseProgress(job.progressJson),
      result: parseResult(job.resultJson),
      error: job.error,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      finishedAt: job.finishedAt
    };
  }

  async reverse(
    batchId: number,
    input: unknown,
    _actorId: number
  ): Promise<{ readonly batchId: number; readonly reverted: number; readonly dryRun: boolean }> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => reverseBodySchema.parseAsync(input),
      "Promotion reversal validation failed"
    );
    const batch = await this.ctx.repos.lifecycle.findBatch(scoped, batchId);
    if (batch === null) throw new NotFoundError("Promotion batch", batchId);
    if (batch.status !== "completed") {
      throw new ConflictError("Only a completed batch can be reversed");
    }
    const depends = await this.ctx.repos.lifecycle.laterBatchDepends(
      scoped,
      batch.academicId,
      batchId,
      batch.toClassId
    );
    if (depends) {
      throw new ConflictError("A later batch depends on this batch's destination");
    }
    const outcomes = await this.ctx.repos.lifecycle.listOutcomesForBatch(scoped, batchId);
    if (parsed.dryRun) {
      return { batchId, reverted: outcomes.length, dryRun: true };
    }
    let reverted = 0;
    for (const outcome of outcomes) {
      if (outcome.outcome !== "promoted" && outcome.outcome !== "graduated") continue;
      if (outcome.toRecordId !== null) {
        await this.ctx.repos.profiles.deleteRecord(scoped, outcome.toRecordId);
      }
      if (outcome.fromRecordId !== null) {
        const source = await this.ctx.repos.profiles.findRecordById(
          scoped,
          outcome.fromRecordId
        );
        if (source !== null) {
          await this.ctx.repos.profiles.restorePlacement(scoped, {
            studentId: outcome.studentId,
            recordId: source.id,
            classId: source.classId,
            sectionId: source.sectionId,
            academicId: source.academicId
          });
        }
      }
      reverted += 1;
    }
    await this.ctx.repos.lifecycle.updateBatch(scoped, batchId, {
      status: "reversed",
      finishedAt: this.ctx.ports.clock.now()
    });
    return { batchId, reverted, dryRun: false };
  }

  async quarantine(sessionId: number): Promise<QuarantineView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const sourceAcademicId = await this.sourceYear(sessionId);
    const rows = await this.ctx.repos.queries.listQuarantineRows(scoped, sourceAcademicId);
    return groupQuarantine(sessionId, rows);
  }

  async quarantineCsv(sessionId: number): Promise<string> {
    return quarantineCsv(await this.quarantine(sessionId));
  }

  async quarantinePdf(sessionId: number): Promise<ReturnType<typeof quarantineDocument>> {
    return quarantineDocument(
      await this.quarantine(sessionId),
      this.ctx.ports.clock.now()
    );
  }
}
