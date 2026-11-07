import { buildIntegrityReport } from "../../../schema/integrity";
import type { IntegrityReportView } from "../../../schema/integrity";
import type { ServiceContext } from "../context";
import { requireScopedContext } from "../context";
import { ConflictError, ValidationError } from "../errors";

export interface GateOptions {
  readonly force?: boolean;
  readonly reason?: string;
}

export interface ActivationGateOptions {
  readonly allowUnreviewedStaffing?: boolean;
  readonly reason?: string;
}

export async function readIntegrityReport(
  ctx: ServiceContext,
  sessionId: number
): Promise<IntegrityReportView> {
  const scoped = requireScopedContext(ctx.repos.ctx);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    throw new ValidationError("A positive session id is required", "sessionId");
  }
  const counts = await ctx.repos.lifecycle.readIntegrityCounts(scoped, sessionId);
  return buildIntegrityReport(sessionId, counts);
}

export async function assertIdentityGate(
  ctx: ServiceContext,
  sessionId: number,
  options: GateOptions = {}
): Promise<IntegrityReportView> {
  const report = await readIntegrityReport(ctx, sessionId);
  if (report.blockingIdentity === 0) return report;
  if (options.force !== true) {
    throw new ConflictError(
      `INTEGRITY_GATE_FAILED: ${report.blockingIdentity} identity finding(s) remain`
    );
  }
  if (options.reason === undefined || options.reason.trim().length < 10) {
    throw new ValidationError("A written reason is required to waive the gate", "reason");
  }
  const scoped = requireScopedContext(ctx.repos.ctx);
  await ctx.repos.lifecycle.insertResolutions(scoped, [
    {
      schoolId: scoped.tenant.schoolId,
      findingId: "GATE_WAIVER",
      entity: "sm_academic_years",
      entityId: String(sessionId),
      beforeJson: JSON.stringify({ blockingIdentity: report.blockingIdentity }),
      afterJson: JSON.stringify({ waived: true }),
      reason: options.reason.trim(),
      archiveKey: null,
      appliedAt: ctx.ports.clock.now()
    }
  ]);
  return report;
}

export async function assertActivationGate(
  ctx: ServiceContext,
  sessionId: number,
  options: ActivationGateOptions = {}
): Promise<IntegrityReportView> {
  const report = await readIntegrityReport(ctx, sessionId);
  if (report.blockingTarget === 0) return report;
  if (options.allowUnreviewedStaffing !== true) {
    throw new ConflictError(
      `STAFFING_REVIEW_REQUIRED: ${report.readiness.unreviewedSections} section(s) pending, ` +
        `${report.readiness.classesWithoutAssignments} unstaffed`
    );
  }
  if (options.reason === undefined || options.reason.trim().length < 10) {
    throw new ValidationError("A written reason is required to waive staffing review", "reason");
  }
  const scoped = requireScopedContext(ctx.repos.ctx);
  await ctx.repos.lifecycle.insertResolutions(scoped, [
    {
      schoolId: scoped.tenant.schoolId,
      findingId: "STAFFING_WAIVER",
      entity: "sm_academic_years",
      entityId: String(sessionId),
      beforeJson: JSON.stringify({ blockingTarget: report.blockingTarget }),
      afterJson: JSON.stringify({ waived: true }),
      reason: options.reason.trim(),
      archiveKey: null,
      appliedAt: ctx.ports.clock.now()
    }
  ]);
  return report;
}
