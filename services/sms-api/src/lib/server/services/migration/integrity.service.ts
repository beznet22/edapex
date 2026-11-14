import type { IntegrityReportView } from "../../../schema/integrity";
import type { ServiceContext } from "../context";
import {
  assertActivationGate,
  assertIdentityGate,
  readIntegrityReport,
  type ActivationGateOptions,
  type GateOptions
} from "./integrity-gate";

export type IntegrityReport = IntegrityReportView;
export type { ActivationGateOptions, GateOptions };

export class IntegrityService {
  constructor(private readonly ctx: ServiceContext) {}

  async report(sessionId: number): Promise<IntegrityReport> {
    return readIntegrityReport(this.ctx, sessionId);
  }

  async assertIdentityGate(
    sessionId: number,
    options: GateOptions = {}
  ): Promise<IntegrityReport> {
    return assertIdentityGate(this.ctx, sessionId, options);
  }

  async assertActivationGate(
    sessionId: number,
    options: ActivationGateOptions = {}
  ): Promise<IntegrityReport> {
    return assertActivationGate(this.ctx, sessionId, options);
  }
}
