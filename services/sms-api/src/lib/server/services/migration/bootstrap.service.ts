import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { UPPER_BASIC_CLASSES } from "../../../constants/ladder";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { parseOrThrow } from "../validation";
import { assertIdentityGate, readIntegrityReport } from "./integrity-gate";
import {
  bootstrapInputSchema,
  bootstrapProgressSchema,
  bootstrapResultSchema
} from "./bootstrap-input";
import type {
  BootstrapInput,
  BootstrapJobView,
  BootstrapProgress,
  BootstrapResult
} from "./bootstrap-input";
import { runBootstrapSlice } from "./bootstrap-job";

export interface BootstrapDryRunView {
  readonly dryRun: true;
  readonly sessionId: number;
  readonly sourceSessionId: number;
  readonly counts: Readonly<Record<string, number>>;
  readonly readiness: {
    readonly classesWithoutAssignments: number;
    readonly unreviewedSections: number;
    readonly reviewedSections: number;
  };
}

export type BootstrapStartResult = BootstrapJobView | BootstrapDryRunView;

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

export class BootstrapService {
  constructor(private readonly ctx: ServiceContext) {}

  async start(input: unknown, actorId: number): Promise<BootstrapStartResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const parsed = await parseOrThrow(
      () => bootstrapInputSchema.parseAsync(input),
      "Bootstrap validation failed"
    );
    if (parsed.newSession.id === parsed.copyFromSessionId) {
      throw new ValidationError("The target session must differ from the source", "newSession.id");
    }
    const source = await this.ctx.repos.school.selectAcademicYearById(
      scoped,
      parsed.copyFromSessionId
    );
    if (source === null) {
      throw new NotFoundError("Source academic year", parsed.copyFromSessionId);
    }
    const targetYear = await this.ctx.repos.school.findAcademicYearByYear(
      scoped,
      parsed.newSession.year
    );
    if (targetYear !== null) {
      const targetReport = await readIntegrityReport(this.ctx, targetYear.id);
      if (targetReport.readiness.targetCurrentRecords > 0 && !parsed.allowNonEmpty) {
        throw new ConflictError("The target session already contains student records");
      }
    }
    await assertIdentityGate(this.ctx, parsed.newSession.id, {
      force: parsed.force,
      ...(parsed.reason === undefined ? {} : { reason: parsed.reason })
    });

    if (parsed.dryRun) {
      const sourceCounts = await this.ctx.repos.academics.countSourceStructure(
        scoped,
        parsed.copyFromSessionId
      );
      const targetClasses = sourceCounts.classes + UPPER_BASIC_CLASSES.length;
      return {
        dryRun: true,
        sessionId: parsed.newSession.id,
        sourceSessionId: parsed.copyFromSessionId,
        counts: {
          academicYear: 1,
          terms: parsed.terms.length,
          classes: targetClasses,
          sections: sourceCounts.sections,
          subjects: sourceCounts.subjects,
          classSections: targetClasses * sourceCounts.sections,
          subjectAssignments: sourceCounts.assignments,
          classTeachers: sourceCounts.classTeachers,
          routines: sourceCounts.routines,
          gradeBands: sourceCounts.gradeBands
        },
        readiness: {
          classesWithoutAssignments: targetClasses * sourceCounts.sections,
          unreviewedSections: targetClasses * sourceCounts.sections,
          reviewedSections: 0
        }
      };
    }

    const jobId = `bs_${crypto.randomUUID()}`;
    await this.ctx.repos.archive.insertSessionJob(scoped, {
      id: jobId,
      schoolId: scoped.tenant.schoolId,
      kind: "bootstrap",
      academicId: null,
      status: "queued",
      progressJson: null,
      resultJson: null,
      payloadJson: JSON.stringify({ input: parsed, actorId }),
      error: null,
      createdBy: actorId,
      createdAt: this.ctx.ports.clock.now()
    });
    return runBootstrapSlice(this.ctx, jobId);
  }

  async status(jobId: string): Promise<BootstrapJobView> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const job = await this.ctx.repos.archive.findSessionJob(scoped, jobId);
    if (job === null) throw new NotFoundError("Bootstrap job", jobId);
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

  parseInput(input: unknown): Promise<BootstrapInput> {
    return parseOrThrow(
      () => bootstrapInputSchema.parseAsync(input),
      "Bootstrap validation failed"
    );
  }
}
