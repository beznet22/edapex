import type { ArchiveManifest } from "../../../schema/archive";
import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import {
  buildSessionManifest,
  runArchiveSlice,
  sessionObjectStats,
  type SessionObjectStats
} from "./archive-job";
import type { RowCounts, SessionJobView } from "./job-progress";
import { toSessionJobView } from "./job-progress";
import { parseManifest } from "./manifest";

export interface StartArchiveInput {
  readonly sessionId: number;
  readonly purge: boolean;
  readonly dryRun: boolean;
  readonly actorId: number;
}

export interface ArchiveDryRunView {
  readonly dryRun: true;
  readonly sessionId: number;
  readonly status: string;
  readonly students: number;
  readonly rows: RowCounts;
  readonly objects: SessionObjectStats;
}

export type ArchiveStartResult = SessionJobView | ArchiveDryRunView;

export interface ArchiveStatusView {
  readonly sessionId: number;
  readonly status: string;
  readonly archivedAt: number | null;
  readonly manifestKey: string | null;
  readonly objects: SessionObjectStats;
  readonly summaries: number;
  readonly job: SessionJobView | null;
}

export class ArchiveService {
  constructor(private readonly ctx: ServiceContext) {}

  private sessionContext(sessionId: number): ServiceContext {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    return withTenantContext(this.ctx, {
      ...scoped.tenant,
      academicId: sessionId,
      classId: null,
      sectionId: null
    });
  }

  async start(input: StartArchiveInput): Promise<ArchiveStartResult> {
    const sessionCtx = this.sessionContext(input.sessionId);
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const year = await sessionCtx.repos.school.selectAcademicYearById(sctx, input.sessionId);
    if (year === null) throw new NotFoundError("Academic year", input.sessionId);
    if (year.status === "restoring" || year.status === "archived_readable") {
      throw new ConflictError("A restoring or restored session cannot be archived again");
    }

    const active = await sessionCtx.repos.archive.findActiveJobForSession(sctx, {
      academicId: input.sessionId,
      kinds: ["archive", "restore"]
    });
    if (active !== null) {
      throw new ConflictError(`A ${active.kind} job is already ${active.status}`);
    }
    const wipe = await sessionCtx.repos.archive.findActiveWipeJob(sctx);
    if (wipe !== null) {
      throw new ConflictError("A wipe job is active for this school");
    }

    if (input.dryRun) {
      const students = await sessionCtx.repos.queries.countArchiveStudents(
        sctx,
        input.sessionId
      );
      const assessment = await sessionCtx.repos.assessments.countAssessmentRawRows(
        sctx,
        input.sessionId
      );
      const studentAttendance =
        await sessionCtx.repos.attendance.countStudentAttendanceForSession(
          sctx,
          input.sessionId
        );
      const classAttendance = await sessionCtx.repos.attendance.countClassAttendanceForSession(
        sctx,
        input.sessionId
      );
      const summaries = await sessionCtx.repos.archive.countSessionSummariesForSession(
        sctx,
        input.sessionId
      );
      return {
        dryRun: true,
        sessionId: input.sessionId,
        status: year.status,
        students,
        rows: { ...assessment, studentAttendance, classAttendance, summaries },
        objects: await sessionObjectStats(sessionCtx, input.sessionId)
      };
    }

    const jobId = crypto.randomUUID();
    await sessionCtx.repos.archive.insertSessionJob(sctx, {
      id: jobId,
      schoolId: sctx.tenant.schoolId,
      kind: "archive",
      academicId: input.sessionId,
      status: "queued",
      payloadJson: JSON.stringify({
        sessionIds: [input.sessionId],
        purge: input.purge,
        dryRun: false
      }),
      createdBy: input.actorId,
      createdAt: this.ctx.ports.clock.now()
    });
    return runArchiveSlice(sessionCtx, jobId);
  }

  async status(sessionId: number): Promise<ArchiveStatusView> {
    const sessionCtx = this.sessionContext(sessionId);
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const year = await sessionCtx.repos.school.selectAcademicYearById(sctx, sessionId);
    if (year === null) throw new NotFoundError("Academic year", sessionId);
    const jobs = await sessionCtx.repos.archive.listSessionJobs(sctx, { limit: 50 });
    const job = jobs.find((entry) => entry.academicId === sessionId) ?? null;
    return {
      sessionId,
      status: year.status,
      archivedAt: year.archivedAt,
      manifestKey: year.archiveManifestKey,
      objects: await sessionObjectStats(sessionCtx, sessionId),
      summaries: await sessionCtx.repos.archive.countSessionSummariesForSession(sctx, sessionId),
      job: job === null ? null : toSessionJobView(job)
    };
  }

  async manifest(sessionId: number): Promise<ArchiveManifest> {
    const sessionCtx = this.sessionContext(sessionId);
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const year = await sessionCtx.repos.school.selectAcademicYearById(sctx, sessionId);
    if (year === null) throw new NotFoundError("Academic year", sessionId);
    if (year.archiveManifestKey !== null) {
      const bytes = await sessionCtx.ports.archiveStore.get(year.archiveManifestKey);
      if (bytes !== null) {
        const parsed = parseManifest(bytes);
        if (parsed !== null) return parsed;
      }
    }
    return buildSessionManifest(sessionCtx, sessionId, this.ctx.ports.clock.now());
  }
}
