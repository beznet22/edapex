import type { ServiceContext } from "../context";
import { requireScopedContext, withTenantContext } from "../context";
import { ConflictError, NotFoundError } from "../errors";
import type { SessionJobView } from "./job-progress";
import { runRestoreSlice, restorePreflight, type RestorePreflight } from "./restore-job";

export interface StartRestoreInput {
  readonly sessionId: number;
  readonly dryRun: boolean;
  readonly actorId: number;
}

export interface RestoreDryRunView {
  readonly dryRun: true;
  readonly sessionId: number;
  readonly status: string;
  readonly preflight: RestorePreflight;
}

export type RestoreStartResult = SessionJobView | RestoreDryRunView;

export class RestoreService {
  constructor(private readonly ctx: ServiceContext) {}

  async start(input: StartRestoreInput): Promise<RestoreStartResult> {
    const scoped = requireScopedContext(this.ctx.repos.ctx);
    const sessionCtx = withTenantContext(this.ctx, {
      ...scoped.tenant,
      academicId: input.sessionId,
      classId: null,
      sectionId: null
    });
    const sctx = requireScopedContext(sessionCtx.repos.ctx);
    const year = await sessionCtx.repos.school.selectAcademicYearById(sctx, input.sessionId);
    if (year === null) throw new NotFoundError("Academic year", input.sessionId);
    if (year.status === "archived_readable") {
      throw new ConflictError("This session has already been restored");
    }
    if (year.status !== "archived") {
      throw new ConflictError("Only an archived session can be restored");
    }
    const active = await sessionCtx.repos.archive.findActiveJobForSession(sctx, {
      academicId: input.sessionId,
      kinds: ["archive", "restore"]
    });
    if (active !== null) {
      throw new ConflictError(`A ${active.kind} job is already ${active.status}`);
    }

    if (input.dryRun) {
      return {
        dryRun: true,
        sessionId: input.sessionId,
        status: year.status,
        preflight: await restorePreflight(sessionCtx, input.sessionId)
      };
    }

    const jobId = crypto.randomUUID();
    await sessionCtx.repos.archive.insertSessionJob(sctx, {
      id: jobId,
      schoolId: sctx.tenant.schoolId,
      kind: "restore",
      academicId: input.sessionId,
      status: "queued",
      payloadJson: JSON.stringify({
        sessionIds: [input.sessionId],
        purge: false,
        dryRun: false
      }),
      createdBy: input.actorId,
      createdAt: this.ctx.ports.clock.now()
    });
    return runRestoreSlice(sessionCtx, jobId);
  }
}
